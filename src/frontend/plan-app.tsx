import { createRoot } from 'react-dom/client';
import { PlanMap } from './components/PlanMap';

// Entry point for the development-plan map (separate bundle from the main app).
const container = document.getElementById('plan-root');
if (container) {
    createRoot(container).render(<PlanMap />);
}
