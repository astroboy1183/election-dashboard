import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import StateLayout from './components/layout/StateLayout'
import CommandPalette from './components/CommandPalette'
import { AIToolsProvider } from './lib/AIToolsContext'
import Home from './pages/Home'
import AllIndia from './pages/AllIndia'
import Overview from './pages/Overview'
import Parties from './pages/Parties'
import Constituencies from './pages/Constituencies'
import ConstituencyDetail from './pages/ConstituencyDetail'
import Results from './pages/Results'
import Swing from './pages/Swing'
import Geography from './pages/Geography'
import MapView from './pages/MapView'
import Assets from './pages/Assets'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: Infinity, retry: 1 } },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AIToolsProvider>
          <CommandPalette />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/all-india" element={<AllIndia />} />
            <Route path="/:state" element={<StateLayout />}>
              <Route index element={<Navigate to="overview" replace />} />
              <Route path="overview" element={<Overview />} />
              <Route path="parties" element={<Parties />} />
              <Route path="constituencies" element={<Constituencies />} />
              <Route path="constituencies/:acNumber" element={<ConstituencyDetail />} />
              {/* /candidates redirects to /results — Candidates page merged in 2026-05 */}
              <Route path="candidates" element={<Navigate to="../results" replace />} />
              <Route path="results" element={<Results />} />
              <Route path="swing" element={<Swing />} />
              <Route path="geography" element={<Geography />} />
              <Route path="map" element={<MapView />} />
              <Route path="assets" element={<Assets />} />
            </Route>
          </Routes>
        </AIToolsProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
