import { Feather } from '@expo/vector-icons';
import {
  getActiveUser,
  makeId,
  money,
  shortDate,
  type ClothingItem,
  type ClothingSale,
} from '@gatsi/domain';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AppHeader } from '../components/AppHeader';
import { Screen } from '../components/Screen';
import { Card, EmptyState, Input, PrimaryButton, SectionTitle } from '../components/ui';
import { useAppStore } from '../store/AppStore';
import { apiAction } from '../store/api';
import { colors, radius } from '../theme';

type ClothingDraft = {
  branchId: string;
  name: string;
  sku: string;
  category: string;
  size: string;
  color: string;
  price: string;
  quantity: string;
  reorderLevel: string;
};

const draftFromItem = (item: ClothingItem): ClothingDraft => ({
  branchId: item.branchId,
  name: item.name,
  sku: item.sku,
  category: item.category,
  size: item.size,
  color: item.color,
  price: String(item.price),
  quantity: String(item.quantity),
  reorderLevel: String(item.reorderLevel),
});

type DraftValidation = { error: string } | { price: number; quantity: number; reorderLevel: number };
type ClothingSaleWithListPrice = ClothingSale & { listUnitPrice: number };

const validateDraft = (draft: ClothingDraft): DraftValidation => {
  const price = Number(draft.price);
  const quantity = Number(draft.quantity);
  const reorderLevel = Number(draft.reorderLevel);
  if (!draft.branchId || !draft.name.trim() || !draft.sku.trim() || !draft.category.trim()) return { error: 'Branch, item name, SKU and category are required.' };
  if (!draft.size.trim() || !draft.color.trim()) return { error: 'Size and colour are required. Use “Assorted” where appropriate.' };
  if (!draft.price.trim() || !Number.isFinite(price) || price < 0 || price > 1_000_000) return { error: 'Enter a valid selling price between zero and 1,000,000.' };
  if (!draft.quantity.trim() || !Number.isInteger(quantity) || quantity < 0 || quantity > 1_000_000) return { error: 'Opening quantity must be a whole number between zero and 1,000,000.' };
  if (!draft.reorderLevel.trim() || !Number.isInteger(reorderLevel) || reorderLevel < 0 || reorderLevel > 1_000_000) return { error: 'Reorder level must be a whole number between zero and 1,000,000.' };
  return { price, quantity, reorderLevel };
};

export function ShopScreen() {
  return <ShopView />;
}

function ShopView() {
  const { state, dispatch } = useAppStore();
  const user = getActiveUser(state)!;
  const [creating, setCreating] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [saleItemId, setSaleItemId] = useState<string | null>(null);
  const [adjustingItemId, setAdjustingItemId] = useState<string | null>(null);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);

  const clothingItems = (state.clothingItems ?? []).filter((item) => (
    (state.activeBranchId === 'all' || item.branchId === state.activeBranchId)
    && (user.role === 'admin' || item.active)
  ));
  const activeClothingItems = clothingItems.filter((item) => item.active);
  const lowClothingItems = activeClothingItems.filter((item) => item.quantity <= item.reorderLevel);
  const totalSaleableUnits = activeClothingItems.reduce((sum, item) => sum + item.quantity, 0);
  const recentSales = (state.clothingSales ?? [])
    .filter((sale) => state.activeBranchId === 'all' || sale.branchId === state.activeBranchId)
    .slice()
    .sort((a, b) => b.soldAt.localeCompare(a.soldAt))
    .slice(0, 8);

  const changeAvailability = async (item: ClothingItem) => {
    if (busyItemId) return;
    setBusyItemId(item.id);
    try {
      const selectedBranchId = state.activeBranchId;
      const { id: _id, ...updates } = item;
      const remoteState = await apiAction({ type: 'UPDATE_CLOTHING_ITEM', itemId: item.id, updates: { ...updates, active: !item.active } });
      dispatch({ type: 'HYDRATE', state: { ...remoteState, activeBranchId: selectedBranchId } });
      setEditingItemId(null);
      setSaleItemId(null);
      setAdjustingItemId(null);
    } catch (error) {
      Alert.alert(`Could not ${item.active ? 'archive' : 'restore'} item`, error instanceof Error ? error.message : 'The clothing item could not be updated.');
    } finally {
      setBusyItemId(null);
    }
  };

  const requestAvailabilityChange = (item: ClothingItem) => {
    if (!item.active) {
      void changeAvailability(item);
      return;
    }
    Alert.alert(
      'Archive clothing item?',
      `${item.name} will be hidden from new sales. Its stock and sales history will be retained, and the item can be restored later.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Archive item', style: 'destructive', onPress: () => void changeAvailability(item) },
      ],
    );
  };

  return <Screen>
    <AppHeader title="Shop" subtitle="Manage retail items, stock and negotiated sales" />

    <View style={styles.retailHero}>
      <View style={styles.flex}>
        <Text style={styles.heroEyebrow}>CLOTHING STOCK</Text>
        <Text style={styles.heroValue}>{totalSaleableUnits} units available</Text>
        <Text style={styles.heroMeta}>{activeClothingItems.length} active item{activeClothingItems.length === 1 ? '' : 's'} · {lowClothingItems.length} low on stock</Text>
      </View>
      <View style={[styles.heroIcon, lowClothingItems.length > 0 && styles.heroIconAlert]}>
        <Feather name={lowClothingItems.length > 0 ? 'alert-triangle' : 'shopping-bag'} size={25} color={lowClothingItems.length > 0 ? colors.amber : colors.primary} />
      </View>
    </View>

    <SectionTitle
      title="Clothing catalogue"
      action={user.role === 'admin' ? (creating ? 'Close' : 'Add item') : undefined}
      onPress={user.role === 'admin' ? () => setCreating((value) => !value) : undefined}
    />
    {creating && user.role === 'admin' ? <Card style={styles.formCard}><ClothingCreator onClose={() => setCreating(false)} /></Card> : null}

    {clothingItems.map((item) => {
      const branch = state.branches.find((entry) => entry.id === item.branchId);
      const isLow = item.quantity <= item.reorderLevel;
      const isBusy = busyItemId === item.id;
      return <Card key={item.id} style={[styles.productCard, !item.active && styles.inactiveCard]}>
        <View style={styles.productTop}>
          <View style={[styles.productIcon, isLow && item.active && styles.stockIconLow]}><Feather name="shopping-bag" size={20} color={isLow && item.active ? colors.amber : colors.primary} /></View>
          <View style={styles.flex}>
            <Text style={styles.productName}>{item.name}</Text>
            <Text style={styles.productMeta}>{item.sku} · {branch?.shortName ?? 'Branch'} · {item.category}</Text>
            <Text style={styles.productVariant}>{item.size} · {item.color}</Text>
          </View>
          <View style={[styles.statusPill, !item.active ? styles.inactivePill : isLow ? styles.lowPill : null]}>
            <Text style={[styles.statusText, !item.active ? styles.inactiveText : isLow ? styles.lowText : null]}>{!item.active ? 'Archived' : isLow ? 'Low' : 'Active'}</Text>
          </View>
        </View>
        <View style={styles.productStats}>
          <View><Text style={styles.productQuantity}>{item.quantity}</Text><Text style={styles.statLabel}>IN STOCK</Text></View>
          <View><Text style={styles.productPrice}>{money(item.price)}</Text><Text style={styles.statLabel}>LIST PRICE</Text></View>
          <View><Text style={styles.reorderValue}>{item.reorderLevel}</Text><Text style={styles.statLabel}>REORDER AT</Text></View>
        </View>
        <View style={styles.productActions}>
          <TouchableOpacity
            disabled={!item.active || item.quantity < 1 || Boolean(busyItemId)}
            onPress={() => { setSaleItemId((current) => current === item.id ? null : item.id); setEditingItemId(null); setAdjustingItemId(null); }}
            style={[styles.actionButton, styles.saleButton, (!item.active || item.quantity < 1 || Boolean(busyItemId)) && styles.disabled]}
          >
            <Feather name="shopping-cart" size={15} color="#fff" /><Text style={styles.saleButtonText}>Record sale</Text>
          </TouchableOpacity>
          {user.role === 'admin' ? <>
            <TouchableOpacity
              disabled={Boolean(busyItemId)}
              onPress={() => { setAdjustingItemId((current) => current === item.id ? null : item.id); setEditingItemId(null); setSaleItemId(null); }}
              style={[styles.actionButton, styles.secondaryAction, busyItemId && styles.disabled]}
            >
              <Feather name="sliders" size={15} color={colors.primary} /><Text style={styles.secondaryActionText}>Stock</Text>
            </TouchableOpacity>
            <TouchableOpacity
              disabled={Boolean(busyItemId)}
              onPress={() => { setEditingItemId((current) => current === item.id ? null : item.id); setAdjustingItemId(null); setSaleItemId(null); }}
              style={[styles.iconAction, busyItemId && styles.disabled]}
            >
              <Feather name="edit-2" size={16} color={colors.primary} />
            </TouchableOpacity>
          </> : null}
        </View>
        {saleItemId === item.id ? <SaleRecorder item={item} onClose={() => setSaleItemId(null)} /> : null}
        {adjustingItemId === item.id && user.role === 'admin' ? <StockAdjustment item={item} onClose={() => setAdjustingItemId(null)} /> : null}
        {editingItemId === item.id && user.role === 'admin' ? <ClothingEditor item={item} onClose={() => setEditingItemId(null)} /> : null}
        {user.role === 'admin' ? <TouchableOpacity
          disabled={Boolean(busyItemId)}
          onPress={() => requestAvailabilityChange(item)}
          style={[styles.archiveButton, item.active ? styles.archiveActive : styles.restoreActive, busyItemId && styles.disabled]}
        >
          {isBusy ? <ActivityIndicator size="small" color={item.active ? colors.red : colors.primary} /> : <Feather name={item.active ? 'archive' : 'rotate-ccw'} size={14} color={item.active ? colors.red : colors.primary} />}
          <Text style={[styles.archiveText, { color: item.active ? colors.red : colors.primary }]}>{item.active ? 'Archive item' : 'Restore item'}</Text>
        </TouchableOpacity> : null}
      </Card>;
    })}
    {!clothingItems.length ? <Card><EmptyState icon="shopping-bag" title="No clothing items" body={user.role === 'admin' ? 'Add the first sellable clothing item to start tracking retail stock.' : 'There are no clothing items available for this branch.'} /></Card> : null}

    <SectionTitle title="Recent clothing sales" />
    {recentSales.map((sale) => {
      const item = (state.clothingItems ?? []).find((entry) => entry.id === sale.itemId);
      const seller = state.users.find((entry) => entry.id === sale.soldByUserId);
      const listUnitPrice = (sale as ClothingSaleWithListPrice).listUnitPrice ?? sale.unitPrice;
      return <Card key={sale.id} style={styles.saleHistoryCard}>
        <View style={styles.saleHistoryIcon}><Feather name="check" size={17} color={colors.primary} /></View>
        <View style={styles.flex}>
          <Text style={styles.saleHistoryName}>{item?.name ?? 'Clothing item'}</Text>
          <Text style={styles.saleHistoryMeta}>{sale.quantity} sold · {shortDate(sale.soldAt)} · {seller?.name ?? 'Team member'}</Text>
          <Text style={styles.saleHistoryPrices}>List {money(listUnitPrice)} → final {money(sale.unitPrice)} each</Text>
        </View>
        <View style={styles.saleHistoryAmount}><Text style={styles.saleHistoryTotal}>{money(sale.total)}</Text><Text style={styles.saleHistoryTotalLabel}>FINAL TOTAL</Text></View>
      </Card>;
    })}
    {!recentSales.length ? <Card><EmptyState icon="shopping-cart" title="No clothing sales" body="Completed clothing sales will appear here." /></Card> : null}

  </Screen>;
}

function ClothingCreator({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useAppStore();
  const branches = state.branches.filter((branch) => branch.active);
  const preferredBranchId = state.activeBranchId !== 'all' && branches.some((branch) => branch.id === state.activeBranchId) ? state.activeBranchId : branches[0]?.id ?? '';
  const [draft, setDraft] = useState<ClothingDraft>({ branchId: preferredBranchId, name: '', sku: '', category: '', size: 'Assorted', color: 'Assorted', price: '', quantity: '0', reorderLevel: '2' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const create = async () => {
    if (saving) return;
    const parsed = validateDraft(draft);
    if ('error' in parsed) return setError(parsed.error);
    const item: ClothingItem = {
      id: makeId('clothing'),
      branchId: draft.branchId,
      name: draft.name.trim(),
      sku: draft.sku.trim().toUpperCase(),
      category: draft.category.trim(),
      size: draft.size.trim(),
      color: draft.color.trim(),
      price: parsed.price,
      quantity: parsed.quantity,
      reorderLevel: parsed.reorderLevel,
      active: true,
    };
    setSaving(true);
    setError('');
    try {
      const selectedBranchId = state.activeBranchId;
      const remoteState = await apiAction({ type: 'CREATE_CLOTHING_ITEM', item });
      dispatch({ type: 'HYDRATE', state: { ...remoteState, activeBranchId: selectedBranchId } });
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The clothing item could not be created.');
    } finally {
      setSaving(false);
    }
  };

  return <View style={styles.inlineForm}>
    <FormHeading icon="plus" title="Add clothing item" body="Create a saleable item and its opening stock balance." />
    <ClothingFields draft={draft} branches={branches} disabled={saving} onChange={(key, value) => { setDraft((current) => ({ ...current, [key]: value })); setError(''); }} showQuantity />
    {error ? <ErrorNotice message={error} /> : null}
    <View style={styles.formActions}><PrimaryButton title="Cancel" icon="x" secondary compact disabled={saving} onPress={onClose} /><View style={styles.flex}><PrimaryButton title="Add item" icon="plus" compact loading={saving} disabled={!branches.length} onPress={() => void create()} /></View></View>
  </View>;
}

function ClothingEditor({ item, onClose }: { item: ClothingItem; onClose: () => void }) {
  const { state, dispatch } = useAppStore();
  const branches = state.branches.filter((branch) => branch.active || branch.id === item.branchId);
  const [draft, setDraft] = useState<ClothingDraft>(draftFromItem(item));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (saving) return;
    const parsed = validateDraft(draft);
    if ('error' in parsed) return setError(parsed.error);
    setSaving(true);
    setError('');
    try {
      const selectedBranchId = state.activeBranchId;
      const remoteState = await apiAction({
        type: 'UPDATE_CLOTHING_ITEM',
        itemId: item.id,
        updates: {
          branchId: draft.branchId,
          name: draft.name.trim(),
          sku: draft.sku.trim().toUpperCase(),
          category: draft.category.trim(),
          size: draft.size.trim(),
          color: draft.color.trim(),
          price: parsed.price,
          reorderLevel: parsed.reorderLevel,
          active: item.active,
        },
      });
      dispatch({ type: 'HYDRATE', state: { ...remoteState, activeBranchId: selectedBranchId } });
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The clothing item could not be updated.');
    } finally {
      setSaving(false);
    }
  };

  return <View style={styles.inlineForm}>
    <FormHeading icon="edit-3" title="Edit clothing item" body="Update catalogue details without changing its sales history." />
    <ClothingFields draft={draft} branches={branches} disabled={saving} onChange={(key, value) => { setDraft((current) => ({ ...current, [key]: value })); setError(''); }} />
    {error ? <ErrorNotice message={error} /> : null}
    <View style={styles.formActions}><PrimaryButton title="Cancel" icon="x" secondary compact disabled={saving} onPress={onClose} /><View style={styles.flex}><PrimaryButton title="Save item" icon="check" compact loading={saving} onPress={() => void save()} /></View></View>
  </View>;
}

function ClothingFields({ draft, branches, disabled, onChange, showQuantity = false }: { draft: ClothingDraft; branches: { id: string; shortName: string; name: string }[]; disabled: boolean; onChange: (key: keyof ClothingDraft, value: string) => void; showQuantity?: boolean }) {
  return <>
    <Text style={styles.fieldLabel}>Branch *</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choiceRow}>
      {branches.map((branch) => <Choice key={branch.id} label={branch.shortName || branch.name} selected={draft.branchId === branch.id} disabled={disabled} onPress={() => onChange('branchId', branch.id)} />)}
    </ScrollView>
    {!branches.length ? <ErrorNotice message="An active branch is required before clothing stock can be added." /> : null}
    <Input label="Item name *" value={draft.name} editable={!disabled} onChangeText={(value) => onChange('name', value)} autoCapitalize="words" />
    <View style={styles.twoColumns}>
      <Input style={styles.halfField} label="SKU *" value={draft.sku} editable={!disabled} onChangeText={(value) => onChange('sku', value)} autoCapitalize="characters" autoCorrect={false} />
      <Input style={styles.halfField} label="Category *" value={draft.category} editable={!disabled} onChangeText={(value) => onChange('category', value)} autoCapitalize="words" />
    </View>
    <View style={styles.twoColumns}>
      <Input style={styles.halfField} label="Size *" value={draft.size} editable={!disabled} onChangeText={(value) => onChange('size', value)} />
      <Input style={styles.halfField} label="Colour *" value={draft.color} editable={!disabled} onChangeText={(value) => onChange('color', value)} autoCapitalize="words" />
    </View>
    <View style={styles.twoColumns}>
      <Input style={styles.halfField} label="List price *" value={draft.price} editable={!disabled} onChangeText={(value) => onChange('price', value)} keyboardType="decimal-pad" />
      <Input style={styles.halfField} label="Reorder at *" value={draft.reorderLevel} editable={!disabled} onChangeText={(value) => onChange('reorderLevel', value)} keyboardType="number-pad" />
    </View>
    {showQuantity ? <Input label="Opening quantity *" value={draft.quantity} editable={!disabled} onChangeText={(value) => onChange('quantity', value)} keyboardType="number-pad" /> : null}
  </>;
}

function SaleRecorder({ item, onClose }: { item: ClothingItem; onClose: () => void }) {
  const { state, dispatch } = useAppStore();
  const user = getActiveUser(state)!;
  const [quantity, setQuantity] = useState('1');
  const [finalUnitPrice, setFinalUnitPrice] = useState(String(item.price));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const record = async () => {
    if (saving) return;
    const parsedQuantity = Number(quantity);
    const parsedFinalUnitPrice = Number(finalUnitPrice);
    if (!Number.isInteger(parsedQuantity) || parsedQuantity < 1) return setError('Sale quantity must be a positive whole number.');
    if (parsedQuantity > item.quantity) return setError(`Only ${item.quantity} unit${item.quantity === 1 ? '' : 's'} are currently in stock.`);
    if (!finalUnitPrice.trim() || !Number.isFinite(parsedFinalUnitPrice) || parsedFinalUnitPrice < 0 || parsedFinalUnitPrice > 1_000_000 || Math.abs(parsedFinalUnitPrice - Number(parsedFinalUnitPrice.toFixed(2))) > 1e-9) return setError('Enter a valid negotiated price between zero and 1,000,000 with no more than two decimal places.');
    const total = Number((parsedQuantity * parsedFinalUnitPrice).toFixed(2));
    const sale: ClothingSaleWithListPrice = {
      id: makeId('clothing-sale'),
      itemId: item.id,
      branchId: item.branchId,
      quantity: parsedQuantity,
      listUnitPrice: item.price,
      unitPrice: parsedFinalUnitPrice,
      total,
      soldAt: new Date().toISOString(),
      soldByUserId: user.id,
    };
    setSaving(true);
    setError('');
    try {
      const selectedBranchId = state.activeBranchId;
      const remoteState = await apiAction({ type: 'RECORD_CLOTHING_SALE', sale });
      dispatch({ type: 'HYDRATE', state: { ...remoteState, activeBranchId: selectedBranchId } });
      onClose();
      Alert.alert('Sale recorded', `${parsedQuantity} × ${item.name} sold for ${money(sale.total)} at the negotiated price. Stock has been adjusted automatically.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The sale could not be recorded.');
    } finally {
      setSaving(false);
    }
  };

  const parsedQuantity = Number(quantity);
  const parsedFinalUnitPrice = Number(finalUnitPrice);
  const validQuantity = Number.isInteger(parsedQuantity) && parsedQuantity > 0 ? parsedQuantity : 0;
  const validFinalUnitPrice = finalUnitPrice.trim() && Number.isFinite(parsedFinalUnitPrice) && parsedFinalUnitPrice >= 0 ? parsedFinalUnitPrice : 0;
  const listTotal = Number((validQuantity * item.price).toFixed(2));
  const finalTotal = Number((validQuantity * validFinalUnitPrice).toFixed(2));
  const difference = Number((listTotal - finalTotal).toFixed(2));
  return <View style={styles.inlineForm}>
    <FormHeading icon="shopping-cart" title="Record negotiated sale" body={`${item.quantity} currently in stock. The original list price is preserved with the final selling price.`} />
    <View style={styles.twoColumns}>
      <Input style={styles.halfField} label="Quantity *" value={quantity} editable={!saving} onChangeText={(value) => { setQuantity(value); setError(''); }} keyboardType="number-pad" />
      <View style={styles.halfField}><Text style={styles.fieldLabel}>Initial list price</Text><Text style={styles.fixedPrice}>{money(item.price)}</Text></View>
    </View>
    <Input label="Final negotiated unit price *" value={finalUnitPrice} editable={!saving} onChangeText={(value) => { setFinalUnitPrice(value); setError(''); }} keyboardType="decimal-pad" />
    <View style={styles.priceComparison}>
      <View><Text style={styles.comparisonLabel}>LIST TOTAL</Text><Text style={styles.comparisonList}>{money(listTotal)}</Text></View>
      <Feather name="arrow-right" size={18} color={colors.muted} />
      <View style={styles.comparisonFinal}><Text style={styles.comparisonLabel}>FINAL TOTAL</Text><Text style={styles.salePreviewValue}>{money(finalTotal)}</Text></View>
    </View>
    {difference !== 0 ? <Text style={[styles.negotiationDifference, difference < 0 && styles.negotiationMarkup]}>{difference > 0 ? `${money(difference)} below list price` : `${money(Math.abs(difference))} above list price`}</Text> : null}
    {error ? <ErrorNotice message={error} /> : null}
    <View style={styles.formActions}><PrimaryButton title="Cancel" icon="x" secondary compact disabled={saving} onPress={onClose} /><View style={styles.flex}><PrimaryButton title="Complete sale" icon="check" compact loading={saving} onPress={() => void record()} /></View></View>
  </View>;
}

function StockAdjustment({ item, onClose }: { item: ClothingItem; onClose: () => void }) {
  const { state, dispatch } = useAppStore();
  const user = getActiveUser(state)!;
  const [delta, setDelta] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const apply = async () => {
    if (saving) return;
    const parsedDelta = Number(delta);
    if (!Number.isInteger(parsedDelta) || parsedDelta === 0) return setError('Enter a non-zero whole number, such as 5 or -2.');
    if (item.quantity + parsedDelta < 0) return setError(`This change would make stock negative. The current quantity is ${item.quantity}.`);
    setSaving(true);
    setError('');
    try {
      const selectedBranchId = state.activeBranchId;
      const remoteState = await apiAction({ type: 'ADJUST_CLOTHING_STOCK', itemId: item.id, delta: parsedDelta, userId: user.id });
      dispatch({ type: 'HYDRATE', state: { ...remoteState, activeBranchId: selectedBranchId } });
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The stock quantity could not be adjusted.');
    } finally {
      setSaving(false);
    }
  };

  return <View style={styles.inlineForm}>
    <FormHeading icon="sliders" title="Manual stock adjustment" body={`Current balance: ${item.quantity}. Use a positive number for stock received or a negative number for corrections.`} />
    <Input label="Quantity change *" value={delta} editable={!saving} onChangeText={(value) => { setDelta(value); setError(''); }} keyboardType="numbers-and-punctuation" placeholder="Example: 10 or -2" />
    {delta && Number.isFinite(Number(delta)) ? <Text style={styles.adjustmentPreview}>New balance: {item.quantity + Number(delta)}</Text> : null}
    {error ? <ErrorNotice message={error} /> : null}
    <View style={styles.formActions}><PrimaryButton title="Cancel" icon="x" secondary compact disabled={saving} onPress={onClose} /><View style={styles.flex}><PrimaryButton title="Apply change" icon="check" compact loading={saving} onPress={() => void apply()} /></View></View>
  </View>;
}

function FormHeading({ icon, title, body }: { icon: keyof typeof Feather.glyphMap; title: string; body: string }) {
  return <View style={styles.formHeading}><View style={styles.formHeadingIcon}><Feather name={icon} size={17} color={colors.primary} /></View><View style={styles.flex}><Text style={styles.formTitle}>{title}</Text><Text style={styles.formSubtitle}>{body}</Text></View></View>;
}

function Choice({ label, selected, disabled, onPress }: { label: string; selected: boolean; disabled: boolean; onPress: () => void }) {
  return <TouchableOpacity disabled={disabled} accessibilityRole="radio" accessibilityState={{ checked: selected, disabled }} onPress={onPress} style={[styles.choice, selected && styles.choiceSelected, disabled && styles.disabled]}>
    <Feather name={selected ? 'check-circle' : 'circle'} size={14} color={selected ? colors.primary : colors.muted} /><Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{label}</Text>
  </TouchableOpacity>;
}

function ErrorNotice({ message }: { message: string }) {
  return <View style={styles.errorNotice}><Feather name="alert-circle" size={16} color={colors.red} /><Text style={styles.errorText}>{message}</Text></View>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  retailHero: { padding: 18, borderRadius: radius.lg, backgroundColor: colors.primaryLight, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  heroEyebrow: { color: colors.primary, fontSize: 10, fontWeight: '900', letterSpacing: 0.7 },
  heroValue: { color: colors.ink, fontSize: 21, fontWeight: '900', marginTop: 4 },
  heroMeta: { color: colors.muted, fontSize: 10, marginTop: 5 },
  heroIcon: { width: 50, height: 50, borderRadius: 16, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  heroIconAlert: { backgroundColor: colors.amberSoft },
  formCard: { padding: 15, marginBottom: 14 },
  productCard: { padding: 15, marginBottom: 12 },
  inactiveCard: { opacity: 0.72 },
  productTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  productIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  productName: { color: colors.ink, fontSize: 14, fontWeight: '900' },
  productMeta: { color: colors.muted, fontSize: 9, marginTop: 4, textTransform: 'capitalize' },
  productVariant: { color: colors.primary, fontSize: 9, fontWeight: '700', marginTop: 3 },
  statusPill: { borderRadius: 99, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: colors.primaryLight },
  statusText: { color: colors.primary, fontSize: 9, fontWeight: '900' },
  inactivePill: { backgroundColor: colors.redSoft },
  inactiveText: { color: colors.red },
  lowPill: { backgroundColor: colors.amberSoft },
  lowText: { color: colors.amber, fontWeight: '900', fontSize: 9 },
  productStats: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 13, marginTop: 13 },
  productQuantity: { color: colors.ink, fontSize: 20, fontWeight: '900' },
  productPrice: { color: colors.primary, fontSize: 16, fontWeight: '900' },
  reorderValue: { color: colors.ink, fontSize: 16, fontWeight: '900' },
  statLabel: { color: colors.subtle, fontSize: 7, fontWeight: '700', marginTop: 3 },
  productActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 13 },
  actionButton: { minHeight: 40, borderRadius: radius.sm, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  saleButton: { flex: 1, backgroundColor: colors.primary },
  saleButtonText: { color: '#fff', fontSize: 11, fontWeight: '900' },
  secondaryAction: { borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.surface },
  secondaryActionText: { color: colors.primary, fontSize: 10, fontWeight: '900' },
  iconAction: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  archiveButton: { minHeight: 37, marginTop: 11, borderRadius: radius.sm, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  archiveActive: { borderColor: colors.red, backgroundColor: colors.redSoft },
  restoreActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  archiveText: { fontSize: 10, fontWeight: '900' },
  inlineForm: { gap: 13, paddingTop: 15, marginTop: 15, borderTopWidth: 1, borderTopColor: colors.border },
  formHeading: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  formHeadingIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  formTitle: { color: colors.ink, fontSize: 13, fontWeight: '900' },
  formSubtitle: { color: colors.muted, fontSize: 9, lineHeight: 14, marginTop: 3 },
  fieldLabel: { color: colors.ink, fontSize: 12, fontWeight: '800' },
  choiceRow: { gap: 8, paddingRight: 5 },
  choice: { minHeight: 38, paddingHorizontal: 11, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: 6 },
  choiceSelected: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  choiceText: { color: colors.muted, fontSize: 10, fontWeight: '800' },
  choiceTextSelected: { color: colors.primary },
  twoColumns: { flexDirection: 'row', justifyContent: 'space-between' },
  halfField: { width: '48%' },
  formActions: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  errorNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, padding: 10, borderRadius: radius.sm, backgroundColor: colors.redSoft },
  errorText: { flex: 1, color: colors.red, fontSize: 10, lineHeight: 15, fontWeight: '700' },
  salePreviewValue: { color: colors.primaryDark, fontSize: 16, fontWeight: '900' },
  fixedPrice: { minHeight: 48, paddingHorizontal: 13, paddingVertical: 14, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, color: colors.ink, fontSize: 13, fontWeight: '900', backgroundColor: colors.background },
  adjustmentPreview: { color: colors.primary, fontSize: 12, fontWeight: '800' },
  saleHistoryCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13, marginBottom: 9 },
  saleHistoryIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  saleHistoryName: { color: colors.ink, fontSize: 12, fontWeight: '900' },
  saleHistoryMeta: { color: colors.muted, fontSize: 9, marginTop: 4 },
  saleHistoryPrices: { color: colors.muted, fontSize: 9, fontWeight: '700', marginTop: 4 },
  saleHistoryAmount: { alignItems: 'flex-end' },
  saleHistoryTotal: { color: colors.primary, fontSize: 12, fontWeight: '900' },
  saleHistoryTotalLabel: { color: colors.subtle, fontSize: 7, fontWeight: '800', marginTop: 3 },
  priceComparison: { padding: 12, borderRadius: radius.sm, backgroundColor: colors.primaryLight, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  comparisonLabel: { color: colors.muted, fontSize: 8, fontWeight: '800' },
  comparisonList: { color: colors.ink, fontSize: 15, fontWeight: '900', marginTop: 4 },
  comparisonFinal: { alignItems: 'flex-end' },
  negotiationDifference: { color: colors.primary, fontSize: 10, fontWeight: '800', textAlign: 'center' },
  negotiationMarkup: { color: colors.amber },
  stockIconLow: { backgroundColor: colors.amberSoft },
  disabled: { opacity: 0.45 },
});
