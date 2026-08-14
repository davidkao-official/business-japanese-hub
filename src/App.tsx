import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { BookPage } from './app/BookPage'
import { HomePage } from './app/HomePage'
import { LibraryPage } from './app/LibraryPage'
import { NotFoundPage } from './app/NotFoundPage'
import { Layout } from './components/Layout'
import { ReaderPage } from './reader/ReaderPage'

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
        {/* The reader is an immersive surface — it renders OUTSIDE the site
            chrome (no Header/Footer) and owns the whole viewport. */}
        <Route path="books/:slug/read" element={<ReaderPage />} />
        <Route path="books/:slug/read/:chapterSlug" element={<ReaderPage />} />
      </Routes>
    </BrowserRouter>
  )
}
