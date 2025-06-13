import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'

function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="min-h-screen bg-white dark:bg-slate-900 transition-colors duration-200">
      <div className="container mx-auto py-12">
        <div className="text-center mb-12">
          <a href="https://vite.dev" target="_blank" rel="noopener noreferrer" className="inline-block mx-4">
            <img src={viteLogo} className="logo" alt="Vite logo" />
          </a>
          <a href="https://react.dev" target="_blank" rel="noopener noreferrer" className="inline-block mx-4">
            <img src={reactLogo} className="logo react" alt="React logo" />
          </a>
        </div>

        <div className="bg-white dark:bg-slate-800 p-8 rounded-lg border border-ai-purple-200 dark:border-ai-purple-700 mb-8 card">
          <h1 className="text-4xl font-bold text-ai-purple-700 dark:text-ai-purple-300 mb-6">
            AI Review Responder Extension
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-400 mb-8">
            Powered by Vite + React + Tailwind CSS v4
          </p>
          
          <div className="card max-w-md mx-auto">
            <button 
              onClick={() => setCount((count) => count + 1)}
              className="btn-primary mb-4"
            >
              count is {count}
            </button>
            <p className="text-slate-700 dark:text-slate-300 mb-4">
              Edit <code className="bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded text-ai-purple-600 dark:text-ai-purple-400">src/App.tsx</code> and save to test HMR
            </p>
            
            <div className="flex gap-3 justify-center">
              <button className="btn-secondary">Secondary</button>
              <button className="btn-ghost">Ghost</button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="card">
            <h3 className="text-lg font-semibold text-ai-purple-700 dark:text-ai-purple-300 mb-3">🎨 Brand Colors</h3>
            <div className="space-y-2">
              <div className="h-4 bg-ai-purple rounded"></div>
              <div className="h-4 bg-white dark:bg-slate-800 border border-ai-purple-200 dark:border-ai-purple-700 rounded"></div>
            </div>
          </div>
          
          <div className="card">
            <h3 className="text-lg font-semibold text-ai-purple-700 dark:text-ai-purple-300 mb-3">✨ Clean Design</h3>
            <div className="text-center">
              <span className="text-2xl">🤖</span>
              <p className="text-sm text-slate-700 dark:text-slate-300 mt-2">Simple & Elegant</p>
            </div>
          </div>
          
          <div className="card">
            <h3 className="text-lg font-semibold text-ai-purple-700 dark:text-ai-purple-300 mb-3">🌟 Effects</h3>
            <div className="gradient-ai-primary text-white p-3 rounded text-center">
              AI Gradient
            </div>
          </div>
        </div>

        <p className="read-the-docs text-center">
          Click on the Vite and React logos to learn more about this Chrome Extension
        </p>
      </div>
    </div>
  )
}

export default App
