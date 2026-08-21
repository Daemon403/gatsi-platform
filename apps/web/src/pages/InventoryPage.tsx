import { getActiveUser, money } from '@gatsi/domain';
import { AlertTriangle, Boxes, Droplets, Minus, PackagePlus, Plus } from 'lucide-react';
import { Button, Card, Empty, Metric, PageTitle } from '../components/ui';
import { useAppStore } from '../store/AppStore';

export function InventoryPage() {
  const { state, dispatch } = useAppStore();
  const user = getActiveUser(state)!;
  const items = state.inventory.filter((item) => state.activeBranchId === 'all' || item.branchId === state.activeBranchId);
  const low = items.filter((item) => item.quantity <= item.reorderLevel);
  const value = items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
  return <><PageTitle eyebrow="Stock control" title="Inventory" description="Monitor chemicals, packaging and consumables by branch." /><div className="metric-grid three"><Metric icon={<Boxes />} value={items.length} label="Stock lines" detail="Visible branch records" /><Metric icon={<AlertTriangle />} tone={low.length ? 'red' : 'green'} value={low.length} label="Reorder alerts" detail="At or below threshold" /><Metric icon={<PackagePlus />} tone="blue" value={money(value)} label="Stock value" detail="Current estimated cost" /></div><div className="inventory-table card"><div className="inventory-head"><span>Stock item</span><span>Branch</span><span>Quantity</span><span>Reorder at</span><span>Unit cost</span><span>Adjust</span></div>{items.map((item) => { const branch = state.branches.find((entry) => entry.id === item.branchId); const isLow = item.quantity <= item.reorderLevel; return <div className="inventory-row" key={item.id}><div><span className={isLow ? 'inventory-icon low' : 'inventory-icon'}><Droplets /></span><section><strong>{item.name}</strong><small>{item.category}</small></section></div><span>{branch?.shortName}</span><b>{item.quantity} <small>{item.unit}</small></b><span>{item.reorderLevel} {item.unit}</span><span>{money(item.unitCost)}</span><div className="adjust-buttons"><button onClick={() => dispatch({ type: 'ADJUST_INVENTORY', itemId: item.id, delta: -1, userId: user.id })}><Minus /></button><button className="add" onClick={() => dispatch({ type: 'ADJUST_INVENTORY', itemId: item.id, delta: 5, userId: user.id })}><Plus /></button></div>{isLow ? <i className="low-stock-label">Low stock</i> : null}</div>; })}{!items.length ? <Empty title="No inventory found" body="Select another branch to view its stock." /> : null}</div></>;
}
