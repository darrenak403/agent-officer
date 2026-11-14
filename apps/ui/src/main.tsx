import { createRoot } from 'react-dom/client';
import { OfficeDashboard } from './features/office/components/office-dashboard';
import './style.css';

createRoot(document.getElementById('root')!).render(<OfficeDashboard />);
