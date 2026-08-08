import type { Category, PlannedStation } from '../types/plan';
import { CATEGORIES, categoryOf } from '../types/plan';
import { CATEGORY_ICON } from './PlanMarkers';

// The human-managed source spreadsheet (edit view), linked from the heading.
const SHEET_EDIT_URL =
    'https://docs.google.com/spreadsheets/d/11O7I3qN2_afuUsLy40YAZtGNCv_6jz2MYc-KkT_VeXQ/edit?usp=sharing';

interface PlanSidebarProps {
    stations: PlannedStation[];
    visibleCategories: Record<Category, boolean>;
    selected: PlannedStation | null;
    onToggle: (category: Category) => void;
    onSelect: (station: PlannedStation) => void;
}

// Left panel listing stations grouped by category, mirroring the Google My Maps
// sidebar: each category has a show/hide checkbox and, when visible, the list of
// its stations. Clicking an item focuses it on the map.
export function PlanSidebar({ stations, visibleCategories, selected, onToggle, onSelect }: PlanSidebarProps) {
    const byCategory = new Map<Category, PlannedStation[]>();
    for (const c of CATEGORIES) {
        byCategory.set(c, []);
    }
    for (const s of stations) {
        byCategory.get(categoryOf(s))?.push(s);
    }

    return (
        <div className="plan-sidebar">
            <div className="plan-sidebar-title">
                <a href={SHEET_EDIT_URL} target="_blank" rel="noopener noreferrer">
                    道の駅 整備計画
                </a>
            </div>
            {CATEGORIES.map((category) => {
                const items = byCategory.get(category) ?? [];
                return (
                    <div key={category} className="plan-cat">
                        <label className="plan-cat-header">
                            <input
                                type="checkbox"
                                checked={visibleCategories[category]}
                                onChange={() => onToggle(category)}
                            />
                            <img className="plan-swatch" src={CATEGORY_ICON[category]} alt="" />
                            <span>
                                {category} ({items.length})
                            </span>
                        </label>
                        {visibleCategories[category] && items.length > 0 && (
                            <ul className="plan-cat-list">
                                {items.map((s, i) => (
                                    // biome-ignore lint/suspicious/noArrayIndexKey: PlannedStation has no id and the list is never reordered
                                    <li key={`${category}-${i}`}>
                                        <button
                                            type="button"
                                            className={selected === s ? 'plan-item is-selected' : 'plan-item'}
                                            onClick={() => onSelect(s)}
                                        >
                                            <img className="plan-item-icon" src={CATEGORY_ICON[category]} alt="" />
                                            <span className="plan-item-label">
                                                {s.date ? `${s.date}: ${s.name}` : s.name}
                                            </span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
