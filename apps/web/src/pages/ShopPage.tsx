import {
  getActiveUser,
  makeId,
  money,
  type AppAction,
  type ClothingItem,
  type ClothingItemUpdate,
} from '@gatsi/domain';
import {
  AlertTriangle,
  Archive,
  Check,
  DollarSign,
  Minus,
  PackagePlus,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Shirt,
  ShoppingCart,
  Store,
  X,
} from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Button, Card, Empty, FormField, Metric, PageTitle } from '../components/ui';
import { useAppStore } from '../store/AppStore';
import { apiAction } from '../store/api';

type ClothingDraft = Omit<ClothingItem, 'id' | 'active'>;
type SaleWithCapturedListPrice = { unitPrice: number; listUnitPrice?: number };

const itemUpdates = (item: ClothingItem): ClothingItemUpdate => ({
  branchId: item.branchId,
  name: item.name,
  sku: item.sku,
  category: item.category,
  size: item.size,
  color: item.color,
  price: item.price,
  reorderLevel: item.reorderLevel,
  active: item.active,
});

const blankDraft = (branchId: string): ClothingDraft => ({
  branchId,
  name: '',
  sku: '',
  category: '',
  size: '',
  color: '',
  price: 0,
  quantity: 0,
  reorderLevel: 2,
});

const capturedListPrice = (sale: SaleWithCapturedListPrice) => sale.listUnitPrice ?? sale.unitPrice;
const roundMoney = (value: number) => Number(value.toFixed(2));

export function ShopPage() {
  const { state, dispatch } = useAppStore();
  const user = getActiveUser(state)!;
  const isAdmin = user.role === 'admin';
  const activeBranches = state.branches.filter((branch) => branch.active);
  const defaultBranchId = state.activeBranchId !== 'all' && activeBranches.some((branch) => branch.id === state.activeBranchId)
    ? state.activeBranchId
    : activeBranches[0]?.id ?? '';
  const clothing = state.clothingItems.filter((item) => {
    const inSelectedBranch = state.activeBranchId === 'all' || item.branchId === state.activeBranchId;
    return inSelectedBranch && (isAdmin || item.active);
  });
  const clothingSales = state.clothingSales.filter((sale) => state.activeBranchId === 'all' || sale.branchId === state.activeBranchId);
  const lowClothing = clothing.filter((item) => item.active && item.quantity <= item.reorderLevel);
  const retailValue = clothing.filter((item) => item.active).reduce((sum, item) => sum + item.quantity * item.price, 0);
  const salesRevenue = clothingSales.reduce((sum, sale) => sum + sale.total, 0);

  const [showCreate, setShowCreate] = useState(false);
  const [createDraft, setCreateDraft] = useState<ClothingDraft>(() => blankDraft(defaultBranchId));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<ClothingItemUpdate | null>(null);
  const [saleQuantities, setSaleQuantities] = useState<Record<string, string>>({});
  const [negotiatedPrices, setNegotiatedPrices] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const runAction = async (action: AppAction, key: string, successMessage: string) => {
    if (busyKey) return null;
    setBusyKey(key);
    setError('');
    setMessage('');
    try {
      const remoteState = await apiAction(action);
      dispatch({ type: 'HYDRATE', state: remoteState });
      setMessage(successMessage);
      return remoteState;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The store could not be updated.');
      return null;
    } finally {
      setBusyKey('');
    }
  };

  const validateItem = (draft: ClothingDraft | ClothingItemUpdate) => {
    if (!draft.branchId || !draft.name.trim() || !draft.sku.trim() || !draft.category.trim() || !draft.size.trim() || !draft.color.trim()) return 'Complete all product details.';
    if (!Number.isFinite(draft.price) || draft.price <= 0 || draft.price > 1_000_000) return 'Enter a list price greater than zero and no more than 1,000,000.';
    if (!Number.isInteger(draft.reorderLevel) || draft.reorderLevel < 0) return 'The reorder level must be a whole number of zero or more.';
    if ('quantity' in draft && (!Number.isInteger(draft.quantity) || draft.quantity < 0)) return 'Opening quantity must be a whole number of zero or more.';
    return '';
  };

  const createItem = async (event: FormEvent) => {
    event.preventDefault();
    const validationError = validateItem(createDraft);
    if (validationError) { setError(validationError); return; }
    const item: ClothingItem = {
      ...createDraft,
      id: makeId('clothing'),
      name: createDraft.name.trim(),
      sku: createDraft.sku.trim().toUpperCase(),
      category: createDraft.category.trim(),
      size: createDraft.size.trim(),
      color: createDraft.color.trim(),
      active: true,
    };
    const remoteState = await runAction({ type: 'CREATE_CLOTHING_ITEM', item }, 'create-clothing', `${item.name} was added to the store.`);
    if (remoteState) {
      setCreateDraft(blankDraft(defaultBranchId));
      setShowCreate(false);
    }
  };

  const startEdit = (item: ClothingItem) => {
    setEditingId(item.id);
    setEditDraft(itemUpdates(item));
    setShowCreate(false);
    setError('');
    setMessage('');
  };

  const saveEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingId || !editDraft) return;
    const validationError = validateItem(editDraft);
    if (validationError) { setError(validationError); return; }
    const updates: ClothingItemUpdate = {
      ...editDraft,
      name: editDraft.name.trim(),
      sku: editDraft.sku.trim().toUpperCase(),
      category: editDraft.category.trim(),
      size: editDraft.size.trim(),
      color: editDraft.color.trim(),
    };
    const remoteState = await runAction({ type: 'UPDATE_CLOTHING_ITEM', itemId: editingId, updates }, `edit-${editingId}`, `${updates.name} was updated.`);
    if (remoteState) {
      setEditingId(null);
      setEditDraft(null);
    }
  };

  const setItemActive = async (item: ClothingItem, active: boolean) => {
    const verb = active ? 'restore' : 'archive';
    if (!active && !window.confirm(`Archive ${item.name}? Its sales history will be retained and the product can be restored later.`)) return;
    await runAction(
      { type: 'UPDATE_CLOTHING_ITEM', itemId: item.id, updates: { ...itemUpdates(item), active } },
      `${verb}-${item.id}`,
      active ? `${item.name} was restored.` : `${item.name} was archived.`,
    );
  };

  const adjustClothing = async (item: ClothingItem, delta: number) => {
    await runAction(
      { type: 'ADJUST_CLOTHING_STOCK', itemId: item.id, delta, userId: user.id },
      `stock-${item.id}`,
      `${item.name} stock was adjusted by ${delta > 0 ? '+' : ''}${delta}.`,
    );
  };

  const recordSale = async (item: ClothingItem) => {
    const quantity = Number(saleQuantities[item.id] ?? '1');
    const finalUnitPrice = Number(negotiatedPrices[item.id] ?? String(item.price));
    if (!Number.isInteger(quantity) || quantity < 1) { setError('Sale quantity must be a whole number of at least one.'); return; }
    if (quantity > item.quantity) { setError(`Only ${item.quantity} ${item.name} item(s) are in stock.`); return; }
    if (!Number.isFinite(finalUnitPrice) || finalUnitPrice < 0 || finalUnitPrice > 1_000_000) { setError('Enter a negotiated unit price from 0 to 1,000,000.'); return; }

    const listUnitPrice = item.price;
    const listTotal = roundMoney(listUnitPrice * quantity);
    const finalTotal = roundMoney(finalUnitPrice * quantity);
    const sale = {
      id: makeId('clothing-sale'),
      itemId: item.id,
      branchId: item.branchId,
      quantity,
      listUnitPrice,
      unitPrice: finalUnitPrice,
      total: finalTotal,
      soldAt: new Date().toISOString(),
      soldByUserId: user.id,
    };
    const remoteState = await runAction(
      { type: 'RECORD_CLOTHING_SALE', sale },
      `sale-${item.id}`,
      `${quantity} × ${item.name} sold for ${money(finalTotal)}${finalTotal === listTotal ? '' : ` (listed at ${money(listTotal)})`}.`,
    );
    if (remoteState) {
      setSaleQuantities((current) => ({ ...current, [item.id]: '1' }));
      setNegotiatedPrices((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
    }
  };

  const itemForm = (mode: 'create' | 'edit') => {
    const draft = mode === 'create' ? createDraft : editDraft;
    if (!draft) return null;
    const disabled = Boolean(busyKey);
    const update = (key: keyof ClothingDraft, value: string | number) => {
      if (mode === 'create') setCreateDraft((current) => ({ ...current, [key]: value } as ClothingDraft));
      else setEditDraft((current) => current ? { ...current, [key]: value } as ClothingItemUpdate : current);
      setError('');
      setMessage('');
    };
    return <Card className="inline-form retail-item-form">
      <div className="retail-form-heading"><div><span className="eyebrow">{mode === 'create' ? 'New store product' : 'Edit store product'}</span><h2>{mode === 'create' ? 'Add a clothing item' : 'Update clothing item'}</h2></div><button type="button" aria-label="Close form" onClick={() => { if (mode === 'create') setShowCreate(false); else { setEditingId(null); setEditDraft(null); } }}><X /></button></div>
      <form className="form-grid retail-form-grid" onSubmit={mode === 'create' ? createItem : saveEdit}>
        <FormField label="Item name"><input required maxLength={160} disabled={disabled} value={draft.name} onChange={(event) => update('name', event.target.value)} placeholder="e.g. Gatsi golf shirt" /></FormField>
        <FormField label="SKU"><input required maxLength={64} disabled={disabled} value={draft.sku} onChange={(event) => update('sku', event.target.value)} placeholder="e.g. SHIRT-BLK-M" spellCheck={false} /></FormField>
        <FormField label="Category"><input required maxLength={80} disabled={disabled} value={draft.category} onChange={(event) => update('category', event.target.value)} placeholder="e.g. Shirt" /></FormField>
        <FormField label="Branch"><select required disabled={disabled} value={draft.branchId} onChange={(event) => update('branchId', event.target.value)}><option value="">Choose a branch</option>{state.branches.filter((branch) => branch.active || branch.id === draft.branchId).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}{branch.active ? '' : ' (inactive)'}</option>)}</select></FormField>
        <FormField label="Size"><input required maxLength={40} disabled={disabled} value={draft.size} onChange={(event) => update('size', event.target.value)} placeholder="e.g. Medium" /></FormField>
        <FormField label="Colour"><input required maxLength={80} disabled={disabled} value={draft.color} onChange={(event) => update('color', event.target.value)} placeholder="e.g. Black" /></FormField>
        <FormField label="List price (USD)"><input required type="number" min="0.01" max="1000000" step="0.01" disabled={disabled} value={draft.price} onChange={(event) => update('price', Number(event.target.value))} /></FormField>
        {'quantity' in draft ? <FormField label="Opening quantity"><input required type="number" min="0" max="1000000000" step="1" disabled={disabled} value={draft.quantity} onChange={(event) => update('quantity', Number(event.target.value))} /></FormField> : null}
        <FormField label="Reorder alert at"><input required type="number" min="0" max="1000000000" step="1" disabled={disabled} value={draft.reorderLevel} onChange={(event) => update('reorderLevel', Number(event.target.value))} /></FormField>
        <div className="form-actions"><Button type="button" variant="ghost" disabled={disabled} onClick={() => { if (mode === 'create') setShowCreate(false); else { setEditingId(null); setEditDraft(null); } }}>Cancel</Button><Button type="submit" disabled={disabled}>{disabled ? 'Saving...' : mode === 'create' ? 'Add item' : 'Save item'} {mode === 'create' ? <PackagePlus /> : <Save />}</Button></div>
      </form>
    </Card>;
  };

  return <>
    <PageTitle
      eyebrow="Retail"
      title="Store"
      description="Manage products, stock and negotiated sales separately from dry-cleaning services and operating supplies."
      actions={isAdmin ? <Button onClick={() => { setShowCreate((current) => !current); setEditingId(null); setEditDraft(null); setCreateDraft((current) => ({ ...current, branchId: current.branchId || defaultBranchId })); setError(''); }}><Plus /> Add store item</Button> : undefined}
    />

    <div className="metric-grid">
      <Metric icon={<Store />} value={clothing.filter((item) => item.active).length} label="Active products" detail={`${clothing.filter((item) => !item.active).length} archived`} />
      <Metric icon={<AlertTriangle />} tone={lowClothing.length ? 'red' : 'green'} value={lowClothing.length} label="Reorder alerts" detail="At or below threshold" />
      <Metric icon={<PackagePlus />} tone="blue" value={money(retailValue)} label="Stock at list value" detail="Active products" />
      <Metric icon={<DollarSign />} tone="purple" value={money(salesRevenue)} label="Final sales revenue" detail={`${clothingSales.reduce((sum, sale) => sum + sale.quantity, 0)} units sold`} />
    </div>

    {error ? <p className="management-error" role="alert">{error}</p> : null}
    {message ? <p className="inventory-success"><Check /> {message}</p> : null}
    {showCreate && isAdmin ? itemForm('create') : null}
    {editingId && isAdmin ? itemForm('edit') : null}

    <div className="section-heading retail-section-heading"><div><span className="eyebrow">Store catalogue</span><h2>Clothing items</h2></div><small>{clothing.filter((item) => item.active).length} active · {clothing.filter((item) => !item.active).length} archived</small></div>
    <div className="retail-grid">
      {clothing.map((item) => {
        const branch = state.branches.find((entry) => entry.id === item.branchId);
        const isLow = item.quantity <= item.reorderLevel;
        const quantityText = saleQuantities[item.id] ?? '1';
        const negotiatedPriceText = negotiatedPrices[item.id] ?? String(item.price);
        const previewQuantity = Number(quantityText);
        const previewFinalPrice = Number(negotiatedPriceText);
        const canPreview = Number.isInteger(previewQuantity) && previewQuantity > 0 && Number.isFinite(previewFinalPrice) && previewFinalPrice >= 0;
        const listTotal = canPreview ? roundMoney(item.price * previewQuantity) : 0;
        const finalTotal = canPreview ? roundMoney(previewFinalPrice * previewQuantity) : 0;
        const difference = roundMoney(listTotal - finalTotal);
        const itemBusy = busyKey.endsWith(item.id);
        return <Card className={`retail-card ${item.active ? '' : 'retail-card-archived'}`} key={item.id}>
          <div className="retail-card-head"><span className={isLow && item.active ? 'low' : ''}><Shirt /></span><div><small>{item.category} · {item.sku}</small><strong>{item.name}</strong><p>{item.color} · {item.size} · {branch?.shortName ?? 'Unknown branch'}</p></div><i className={item.active ? '' : 'inactive'}>{item.active ? 'Active' : 'Archived'}</i></div>
          <div className="retail-stats"><span><small>In stock</small><strong>{item.quantity}</strong></span><span><small>Reorder at</small><strong>{item.reorderLevel}</strong></span><span><small>List price</small><strong>{money(item.price)}</strong></span></div>
          {isLow && item.active ? <p className="retail-low"><AlertTriangle /> Reorder stock soon</p> : null}
          {item.active ? <div className="retail-sale shop-sale">
            <label><span>Quantity sold</span><input required type="number" min="1" max={Math.max(item.quantity, 1)} step="1" disabled={Boolean(busyKey) || item.quantity === 0} value={quantityText} onChange={(event) => { setSaleQuantities((current) => ({ ...current, [item.id]: event.target.value })); setError(''); }} /></label>
            <label><span>Final negotiated price</span><input required type="number" min="0" max="1000000" step="0.01" disabled={Boolean(busyKey) || item.quantity === 0} value={negotiatedPriceText} onChange={(event) => { setNegotiatedPrices((current) => ({ ...current, [item.id]: event.target.value })); setError(''); }} /></label>
            <div className="shop-sale-preview"><span>Initial total <b>{canPreview ? money(listTotal) : '—'}</b></span><span>Final total <strong>{canPreview ? money(finalTotal) : '—'}</strong></span>{canPreview && difference !== 0 ? <small className={difference > 0 ? 'discount' : 'markup'}>{difference > 0 ? `${money(difference)} below list` : `${money(Math.abs(difference))} above list`}</small> : null}</div>
            <Button disabled={Boolean(busyKey) || item.quantity === 0} onClick={() => recordSale(item)}><ShoppingCart /> {itemBusy ? 'Saving...' : 'Record negotiated sale'}</Button>
          </div> : null}
          {isAdmin ? <div className="retail-admin-actions">
            {item.active ? <div className="retail-adjust"><span>Adjust stock</span><button aria-label={`Remove one ${item.name}`} disabled={Boolean(busyKey) || item.quantity === 0} onClick={() => adjustClothing(item, -1)}><Minus /></button><button className="add" aria-label={`Add one ${item.name}`} disabled={Boolean(busyKey)} onClick={() => adjustClothing(item, 1)}><Plus /></button></div> : <span className="retail-history-note">Sales history retained</span>}
            <Button variant="ghost" disabled={Boolean(busyKey)} onClick={() => startEdit(item)}><Pencil /> Edit</Button>
            <Button variant={item.active ? 'danger' : 'secondary'} disabled={Boolean(busyKey)} onClick={() => setItemActive(item, !item.active)}>{item.active ? <Archive /> : <RotateCcw />} {item.active ? 'Archive' : 'Restore'}</Button>
          </div> : null}
        </Card>;
      })}
      {!clothing.length ? <Card className="retail-empty"><Empty title="No store products found" body={isAdmin ? 'Add the first clothing item for the selected branch.' : 'There are no active store products at this branch.'} /></Card> : null}
    </div>

    <div className="section-heading retail-section-heading shop-history-heading"><div><span className="eyebrow">Sales history</span><h2>List price vs final sold price</h2></div><small>{clothingSales.length} recorded sale{clothingSales.length === 1 ? '' : 's'}</small></div>
    <div className="shop-sales-table card">
      <div className="shop-sales-head"><span>Product</span><span>Date</span><span>Qty</span><span>Initial / list</span><span>Final negotiated</span><span>Final total</span><span>Sold by</span></div>
      {clothingSales.slice(0, 100).map((sale) => {
        const item = state.clothingItems.find((entry) => entry.id === sale.itemId);
        const seller = state.users.find((entry) => entry.id === sale.soldByUserId);
        const branch = state.branches.find((entry) => entry.id === sale.branchId);
        const listPrice = capturedListPrice(sale);
        return <div className="shop-sales-row" key={sale.id}>
          <div><strong>{item?.name ?? 'Archived product'}</strong><small>{item?.sku ?? sale.itemId} · {branch?.shortName ?? 'Unknown branch'}</small></div>
          <span>{new Date(sale.soldAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>
          <b>{sale.quantity}</b>
          <span>{money(listPrice)} <small>each</small></span>
          <strong className="shop-final-price">{money(sale.unitPrice)} <small>each</small></strong>
          <strong>{money(sale.total)}</strong>
          <span>{seller?.name ?? 'Unknown user'}</span>
        </div>;
      })}
      {!clothingSales.length ? <Empty title="No store sales yet" body="Recorded sales will preserve both the original list price and the final negotiated price." /> : null}
    </div>
  </>;
}
