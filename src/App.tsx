import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { BookPage } from './app/BookPage'
import { HomePage } from './app/HomePage'
import { LibraryPage } from './app/LibraryPage'
import { NotFoundPage } from './app/NotFoundPage'
import { Layout } from './components/Layout'

/**
 * Platform-level routing. Routes are intentionally generic — no
 * book-specific route, component, or data lives here yet.
 */
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="library" element={<LibraryPage />} />
          <Route path="books/:slug" element={<BookPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
