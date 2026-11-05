import { EnterForm } from './enter-form'

export const metadata = {
  title: 'Welcome to DadsBot',
}

export default function EnterPage() {
  return (
    <main className="enter-main">
      <div className="panel-card enter-card">
        <h1 className="enter-title">Welcome</h1>
        <p className="enter-lede">
          DadsBot keeps your family&apos;s stories. Type the family word below to
          continue.
        </p>
        <EnterForm />
        <p className="enter-help">
          Don&apos;t know the word? Ask whoever shared this page with you.
        </p>
      </div>
    </main>
  )
}
