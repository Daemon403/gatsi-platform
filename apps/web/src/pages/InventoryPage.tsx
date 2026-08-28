import { getActiveUser, money, type AppAction } from '@gatsi/domain';
import { AlertTriangle, Boxes, Check, Droplets, Minus, PackagePlus, Plus } from 'lucide-react';
import { useState } from 'react';
import { Empty, Metric, PageTitle } from '../components/ui';
import { useAppStore } from '../store/AppStore';
import { apiAction } from '../store/api';

export function InventoryPage() {
  const { state, dispatch } = useAppStore();
  const user = getActiveUser(state)!;
  const consumables = state.inventory.filter((item) => state.activeBranchId === 'all' || item.branchId === state.activeBranchId);
  const lowConsumables = consumables.filter((item) => item.quantity <= item.reorderLevel);
  const consumableValue = consumables.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
  const [busyKey, setBusyKey] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const runAction = async (action: AppAction, key: string, successMessage: string) => {
    if (busyKey) return;
    setBusyKey(key);
    setError('');
    setMessage('');
    try {
      const remoteState = await apiAction(action);
      dispatch({ type: 'HYDRATE', state: remoteState });
      setMessage(successMessage);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The inventory could not be updated.');
    } finally {
      setBusyKey('');
    }
  };

  const adjustConsumable = async (itemId: string, itemName: string, delta: number) => {
    await runAction(
      { type: 'ADJUST_INVENTORY', itemId, delta, userId: user.id },
      `consumable-${itemId}`,
      `${itemName} was adjusted by ${delta > 0 ? '+' : ''}${delta}.`,
    );
  };

  return <>
    <PageTitle
      eyebrow="Stock control"
      title="Operating inventory"
      description="Manage the chemicals, packaging and consumable supplies used by each branch. Retail products are managed separately in Store."
    />

    <div className="metric-grid three">
      <Metric icon={<Boxes />} value={consumables.length} label="Supply lines" detail="Operating stock" />
      <Metric icon={<AlertTriangle />} tone={lowConsumables.length ? 'red' : 'green'} value={lowConsumables.length} label="Reorder alerts" detail="At or below threshold" />
      <Metric icon={<PackagePlus />} tone="blue" value={money(consumableValue)} label="Estimated value" detail="Current quantity at unit cost" />
    </div>

    {error ? <p className="management-error" role="alert">{error}</p> : null}
    {message ? <p className="inventory-success"><Check /> {message}</p> : null}

    <div className="section-heading retail-section-heading consumables-heading"><div><span className="eyebrow">Operating supplies</span><h2>Chemicals, packaging &amp; consumables</h2></div><small>{money(consumableValue)} estimated value</small></div>
    <div className="inventory-table card">
      <div className="inventory-head"><span>Stock item</span><span>Branch</span><span>Quantity</span><span>Reorder at</span><span>Unit cost</span><span>Adjust</span></div>
      {consumables.map((item) => {
        const branch = state.branches.find((entry) => entry.id === item.branchId);
        const isLow = item.quantity <= item.reorderLevel;
        return <div className="inventory-row" key={item.id}><div><span className={isLow ? 'inventory-icon low' : 'inventory-icon'}><Droplets /></span><section><strong>{item.name}</strong><small>{item.category}</small></section></div><span>{branch?.shortName}</span><b>{item.quantity} <small>{item.unit}</small></b><span>{item.reorderLevel} {item.unit}</span><span>{money(item.unitCost)}</span><div className="adjust-buttons"><button aria-label={`Remove one ${item.unit} of ${item.name}`} disabled={Boolean(busyKey) || item.quantity === 0} onClick={() => adjustConsumable(item.id, item.name, -1)}><Minus /></button><button className="add" aria-label={`Add five ${item.unit} of ${item.name}`} disabled={Boolean(busyKey)} onClick={() => adjustConsumable(item.id, item.name, 5)}><Plus /></button></div>{isLow ? <i className="low-stock-label">Low stock</i> : null}</div>;
      })}
      {!consumables.length ? <Empty title="No operating inventory found" body="Select another branch to view its supplies." /> : null}
    </div>
  </>;
}
