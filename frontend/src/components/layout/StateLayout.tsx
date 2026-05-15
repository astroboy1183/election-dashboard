import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'

export default function StateLayout() {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <main className="main-content" style={{ flex: 1, padding: '2rem', overflow: 'auto', minWidth: 0 }}>
        <div className="tricolor-strip" />
        <Outlet />
      </main>
    </div>
  )
}
