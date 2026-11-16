import { EnterForm } from './enter-form'

export const metadata = {
  title: 'Welcome to DadsBot',
}

export default function EnterPage({ searchParams }: { searchParams?: { for?: string } }) {
  const forOperator = searchParams?.for === 'operator'
  return (
    <main className="enter-main">
      <div className="panel-card enter-card">
        <h1 className="enter-title">{forOperator ? 'Caretaker access' : 'Welcome'}</h1>
        <p className="enter-lede">
          {forOperator
            ? 'This page is for the person who looks after DadsBot. Type the caretaker code to continue.'
            : 'DadsBot keeps your family\u2019s stories. Type the family word below to continue.'}
        </p>
        <EnterForm label={forOperator ? 'Caretaker code' : 'Family word'} />
        <p className="enter-help">
          {forOperator ? (
            <>
              Not the caretaker? <a className="link" href="/">Go back to your stories</a>.
            </>
          ) : (
            'Don\u2019t know the word? Ask whoever shared this page with you.'
          )}
        </p>
      </div>
    </main>
  )
}
