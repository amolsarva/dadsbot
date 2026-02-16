'use client'

import { useState } from 'react'
import type { PersonProfile } from '@/lib/person-facts'
import type { TopicProgress } from '@/lib/topic-progress'
import { formatCheckmarks, getCoverageLabel } from '@/lib/topic-progress'

interface EndOfSessionReflectionProps {
  _sessionId: string
  handle: string | null
  personProfile: PersonProfile | null
  topicProgress: TopicProgress[]
  totalTurns: number
  onSave: () => void
  onContinue: () => void
  onStartNew: () => void
}

export function EndOfSessionReflection({
  _sessionId,
  handle,
  personProfile,
  topicProgress,
  totalTurns,
  onSave,
  onContinue,
  onStartNew,
}: EndOfSessionReflectionProps) {
  const [reflectionAnswers, setReflectionAnswers] = useState({
    mostSurprised: '',
    wantToExplore: '',
    memorableQuotes: '',
  })

  // Calculate coverage percentage
  const coveredTopics = topicProgress.filter((t) => t.checkmarks > 0).length
  const totalTopics = topicProgress.length
  const overallCoverage = totalTopics > 0 ? Math.round((coveredTopics / totalTopics) * 100) : 0

  // Get uncovered topics for next session priorities
  const uncoveredTopics = topicProgress
    .filter((t) => t.checkmarks === 0)
    .sort((a, b) => a.topic.localeCompare(b.topic))
    .slice(0, 3)

  const handleReflectionChange = (field: string, value: string) => {
    setReflectionAnswers((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  return (
    <div className="end-of-session-reflection">
      <div className="reflection-overlay" />

      <div className="reflection-modal">
        <div className="reflection-modal__header">
          <h2 className="reflection-modal__title">Session Summary</h2>
        </div>

        <div className="reflection-modal__content">
          {/* Person Profile Section */}
          {personProfile && (
            <section className="reflection-section reflection-section--profile">
              <h3 className="reflection-section__title">
                PROFILE: Who is {personProfile.fullName || 'this person'}?
              </h3>

              <ul className="reflection-profile__facts">
                {personProfile.birthplace && personProfile.currentLocation && (
                  <li>
                    Born in {personProfile.birthplace}, moved to {personProfile.currentLocation}
                  </li>
                )}
                {personProfile.profession && (
                  <li>
                    {personProfile.profession}
                    {personProfile.yearsExperience ? `, ${personProfile.yearsExperience} years` : ''}
                  </li>
                )}
                {personProfile.family && <li>Family: {personProfile.family}</li>}
                {personProfile.personalityTraits && personProfile.personalityTraits.length > 0 && (
                  <li>Personality: {personProfile.personalityTraits.join(', ')}</li>
                )}
              </ul>
            </section>
          )}

          {/* Interview Progress Section */}
          {topicProgress.length > 0 && (
            <section className="reflection-section reflection-section--progress">
              <h3 className="reflection-section__title">
                INTERVIEW PROGRESS: {overallCoverage}% of guide covered
              </h3>

              <div className="reflection-progress__grid">
                {topicProgress.map((topic) => (
                  <div key={topic.topic} className="reflection-progress__item">
                    <div className="reflection-progress__label">{topic.topic}</div>
                    <div className="reflection-progress__checkmarks" title={`${topic.percentage.toFixed(1)}% of conversation`}>
                      {formatCheckmarks(topic.checkmarks)}
                    </div>
                    <div className="reflection-progress__status">{getCoverageLabel(topic.checkmarks)}</div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Next Session Priorities */}
          {uncoveredTopics.length > 0 && (
            <section className="reflection-section reflection-section--priorities">
              <h3 className="reflection-section__title">NEXT SESSION PRIORITIES</h3>

              <ul className="reflection-priorities__list">
                {uncoveredTopics.map((topic) => (
                  <li key={topic.topic} className="reflection-priorities__item">
                    {topic.topic} {`(hasn't come up yet)`}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Reflection Questions */}
          <section className="reflection-section reflection-section--questions">
            <h3 className="reflection-section__title">REFLECTION QUESTIONS</h3>

            <div className="reflection-questions__form">
              <div className="reflection-question">
                <label className="reflection-question__label">
                  1. What surprised you most about their story?
                </label>
                <textarea
                  className="reflection-question__input"
                  value={reflectionAnswers.mostSurprised}
                  onChange={(e) => handleReflectionChange('mostSurprised', e.target.value)}
                  placeholder="Optional note..."
                  rows={2}
                />
              </div>

              <div className="reflection-question">
                <label className="reflection-question__label">
                  2. What would you like to explore more next time?
                </label>
                <textarea
                  className="reflection-question__input"
                  value={reflectionAnswers.wantToExplore}
                  onChange={(e) => handleReflectionChange('wantToExplore', e.target.value)}
                  placeholder="Optional note..."
                  rows={2}
                />
              </div>

              <div className="reflection-question">
                <label className="reflection-question__label">
                  3. Any memorable quotes you want to remember?
                </label>
                <textarea
                  className="reflection-question__input"
                  value={reflectionAnswers.memorableQuotes}
                  onChange={(e) => handleReflectionChange('memorableQuotes', e.target.value)}
                  placeholder="Optional note..."
                  rows={2}
                />
              </div>
            </div>
          </section>

          {/* Summary Stats */}
          <section className="reflection-section reflection-section--stats">
            <div className="reflection-stats__grid">
              <div className="reflection-stats__item">
                <div className="reflection-stats__value">{totalTurns}</div>
                <div className="reflection-stats__label">Questions Asked</div>
              </div>
              <div className="reflection-stats__item">
                <div className="reflection-stats__value">{coveredTopics}</div>
                <div className="reflection-stats__label">Topics Covered</div>
              </div>
              <div className="reflection-stats__item">
                <div className="reflection-stats__value">{overallCoverage}%</div>
                <div className="reflection-stats__label">Coverage</div>
              </div>
            </div>
          </section>
        </div>

        <div className="reflection-modal__footer">
          <button onClick={onContinue} className="btn-outline reflection-action">
            Continue
          </button>
          <button onClick={onSave} className="btn-secondary reflection-action">
            Save Session
          </button>
          <button onClick={onStartNew} className="btn-secondary reflection-action">
            Start New
          </button>
        </div>
      </div>
    </div>
  )
}
