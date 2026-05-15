import {
  BrowserRouter as Router,
  Routes,
  Route,
  useLocation,
} from 'react-router-dom'
import useWindowSize from './hooks/useWindowSize'
import Topnav from './components/topnav/Topnav'
import Sidebar from './components/sidebar/Sidebar'
import MobileNavigation from './components/sidebar/MobileNavigation'
import Footer from './components/footer/Footer'
import Home from './pages/Home'
import AgentPage from './pages/Agent'
import Search from './pages/Search'
import Library from './pages/Library'
import PlaylistPage from './pages/Playlist'
import CONST from './constants/index.jsx'
import styles from './App.module.css'

function AppLayout() {
  const location = useLocation()
  const size = useWindowSize()
  const isDesktop = size.width > CONST.MOBILE_SIZE
  const isLibraryPage =
    location.pathname === '/library' ||
    location.pathname.startsWith('/library/')

  return (
    <div
      className={`${styles.layout} ${isLibraryPage ? styles.libraryLayout : ''}`}
    >
      <div className={styles.topbarShell}>
        <Topnav />
      </div>

      {!isLibraryPage && (isDesktop ? <Sidebar /> : <MobileNavigation />)}

      <main className={styles.mainShell}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/agent" element={<AgentPage />} />
          <Route path="/search" element={<Search />} />
          <Route path="/library" element={<Library />} />
          <Route path="/library/podcasts" element={<Library />} />
          <Route path="/library/artists" element={<Library />} />
          <Route path="/library/albums" element={<Library />} />
          <Route path="/playlist/:path" element={<PlaylistPage />} />
        </Routes>
      </main>

      <Footer />
    </div>
  )
}

function App() {
  return (
    <Router>
      <AppLayout />
    </Router>
  )
}

export default App
