import { OfficeDashboard } from '../features/office/components/office-dashboard';

// Fully client-rendered so the same page ships as static files inside the desktop app.
export default function Page() {
  return <OfficeDashboard />;
}
