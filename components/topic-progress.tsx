'use client'

import { useCallback, useEffect, useState } from 'react'
import { normalizeHandle } from '@/lib/user-scope'

type TopicData = {
  id: string
  label: string
  icon: string
  mentions: number
  snippets: string[]
}

type TopicProgressProps = {
  userHandle?: string | null
}

export function TopicProgress({ userHandle }: TopicProgressProps) {
  const [topics, setTopics] = useState<TopicData[]>([])
  const [loading, setLoading] = useState(true)
  const [maxMentions, setMaxMentions] = useState(1)
  const [sessionCount, setSessionCount] = useState(0)
  const [expandedTopic, setExpandedTopic] = useState<string | null>(null)

  const loadProgress = useCallback(async () => {
    setLoading(true)
    try {
      const handle = normalizeHandle(userHandle)
      const query = handle ? `?handle=${encodeURIComponent(handle)}` : ''
      // Use user-profile API which includes topic progress
      const res = await fetch(`/api/user-profile${query}`)
      const data = await res.json()
      if (data.ok && data.topicProgress) {
        setTopics(data.topicProgress.topics || [])
        setMaxMentions(data.topicProgress.maxMentions || 1)
        setSessionCount(data.topicProgress.sessionCount || 0)
      }
    } catch {
      setTopics([])
    } finally {
      setLoading(false)
    }
  }, [userHandle])

  useEffect(() => {
    loadProgress()
  }, [loadProgress])

  const getProgressLevel = (mentions: number): 'none' | 'low' | 'medium' | 'high' => {
    if (mentions === 0) return 'none'
    const ratio = mentions / maxMentions
    if (ratio < 0.25) return 'low'
    if (ratio < 0.6) return 'medium'
    return 'high'
  }

  const getProgressPercent = (mentions: number): number => {
    if (mentions === 0) return 5 // Show a tiny bit even for zero
    return Math.min(Math.max((mentions / maxMentions) * 100, 10), 100)
  }

  if (loading) {
    return (
      <div className="topic-progress topic-progress--loading">
        <div className="topic-progress__header">
          <h3 className="topic-progress__title">Story Coverage</h3>
        </div>
        <div className="topic-progress__loading">Loading...</div>
      </div>
    )
  }

  if (sessionCount === 0) {
    return (
      <div className="topic-progress topic-progress--empty">
        <div className="topic-progress__header">
          <h3 className="topic-progress__title">Story Coverage</h3>
        </div>
        <div className="topic-progress__empty">
          <p>Start a conversation to see your story progress across different life topics.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="topic-progress">
      <div className="topic-progress__header">
        <h3 className="topic-progress__title">Story Coverage</h3>
        <span className="topic-progress__sessions">{sessionCount} session{sessionCount !== 1 ? 's' : ''}</span>
      </div>
      <div className="topic-progress__grid">
        {topics.map((topic) => {
          const level = getProgressLevel(topic.mentions)
          const percent = getProgressPercent(topic.mentions)
          const isExpanded = expandedTopic === topic.id

          return (
            <div
              key={topic.id}
              className={`topic-meter topic-meter--${level}${isExpanded ? ' topic-meter--expanded' : ''}`}
              onClick={() => setExpandedTopic(isExpanded ? null : topic.id)}
            >
              <div className="topic-meter__header">
                <span className="topic-meter__icon">{topic.icon}</span>
                <span className="topic-meter__label">{topic.label}</span>
              </div>
              <div className="topic-meter__bar">
                <div
                  className="topic-meter__fill"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <div className="topic-meter__count">
                {topic.mentions === 0 ? 'Not yet covered' : `${topic.mentions} mention${topic.mentions !== 1 ? 's' : ''}`}
              </div>
              {isExpanded && topic.snippets.length > 0 && (
                <div className="topic-meter__snippets">
                  {topic.snippets.map((snippet, i) => (
                    <div key={i} className="topic-meter__snippet">&ldquo;{snippet}&rdquo;</div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default TopicProgress
