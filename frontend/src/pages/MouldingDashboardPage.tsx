import { useCallback, useMemo, useState, type FormEvent } from 'react'
import { AlertTriangle, ArrowLeftRight, ArrowRightLeft, Boxes, CheckCircle2, CircleDot, Factory, PackageCheck, PencilLine, ShieldCheck, Truck, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { LiveIndicator } from '../components/LiveIndicator'
import { PageHeader } from '../components/PageHeader'
import { StatusBadge } from '../components/StatusBadge'
import { useRealtimeRefresh } from '../hooks/useRealtimeRefresh'
import { api, displayError, formatDateTime } from '../lib/api'
import type { BlankingCart, MaterialShortage, Press, PressStatus, ProductionShift } from '../types'

const TOPICS = ['/topic/production'] as const
const initialReceiptForm = { cartId: '', pressId: '', overrideReason: '' }

type ItemCompatibility = {
  state: 'MATCH' | 'MISMATCH' | 'MISSING'
  pressItem: string | null
  cartItem: string | null
}

function compareItemCodes(press?: Press, cart?: BlankingCart): ItemCompatibility {
  const pressItem = press?.currentItemCode?.trim() || null
  const cartItem = cart?.itemCode?.trim() || null
  if (!pressItem || !cartItem) return { state: 'MISSING', pressItem, cartItem }
  const normalize = (value: string) => value.toUpperCase().replace(/\s+/g, '')
  return {
    state: normalize(pressItem) === normalize(cartItem) ? 'MATCH' : 'MISMATCH',
    pressItem,
    cartItem,
  }
}

function ItemCompatibilityNotice({ press, cart, compact = false }: { press: Press, cart: BlankingCart, compact?: boolean }) {
  const result = compareItemCodes(press, cart)
  const style = result.state === 'MATCH'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
    : result.state === 'MISMATCH'
      ? 'border-red-200 bg-red-50 text-red-800'
      : 'border-amber-200 bg-amber-50 text-amber-900'
  const Icon = result.state === 'MATCH' ? CheckCircle2 : AlertTriangle
  const heading = result.state === 'MATCH' ? 'ITEM MATCH' : result.state === 'MISMATCH' ? 'ITEM MISMATCH' : 'ITEM CODE MISSING'
  return (
    <div className={`rounded-xl border ${compact ? 'px-2 py-1.5' : 'p-4'} ${style}`} role={result.state === 'MATCH' ? 'status' : 'alert'}>
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 shrink-0" size={compact ? 14 : 18} />
        <div>
          <p className={`${compact ? 'text-[10px]' : 'text-xs'} font-black tracking-wide`}>{heading}</p>
          <p className={`${compact ? 'text-[10px]' : 'mt-1 text-sm'} font-bold`}>Press: {result.pressItem ?? 'Not saved'} · Cart: {result.cartItem ?? 'TBC'}</p>
          {!compact && <p className="mt-1 text-xs font-medium">{result.state === 'MATCH' ? 'This cart matches the press ongoing item.' : result.state === 'MISMATCH' ? 'Check the selected press and cart before continuing.' : 'Save the press item and confirm the cart item before continuing.'}</p>}
        </div>
      </div>
    </div>
  )
}

function cartFactoryContext(value?: string): { productionDate: string; shift: ProductionShift | '' } {
  if (!value) return { productionDate: '', shift: '' }
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Colombo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(value))
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? ''
  const date = `${part('year')}-${part('month')}-${part('day')}`
  const hour = Number(part('hour'))
  if (hour < 6) {
    const previous = new Date(`${date}T00:00:00Z`)
    previous.setUTCDate(previous.getUTCDate() - 1)
    return { productionDate: previous.toISOString().slice(0, 10), shift: 'SHIFT_C' }
  }
  if (hour < 14) return { productionDate: date, shift: 'SHIFT_A' }
  if (hour < 22) return { productionDate: date, shift: 'SHIFT_B' }
  return { productionDate: date, shift: 'SHIFT_C' }
}

export function MouldingDashboardPage() {
  const { user } = useAuth()
  const canReceive = ['MOULDING_OPERATOR', 'MOULDING_SUPERVISOR', 'MANAGER', 'SYSTEM_ADMIN'].includes(user?.role ?? '')
  const canOpenProduction = ['MOULDING_OPERATOR', 'MOULDING_SUPERVISOR', 'MANAGER', 'SYSTEM_ADMIN'].includes(user?.role ?? '')
  const canAssignCarts = ['MOULDING_OPERATOR', 'MOULDING_SUPERVISOR', 'MANAGER', 'SYSTEM_ADMIN'].includes(user?.role ?? '')
  const canViewManagerReport = ['MANAGER', 'SYSTEM_ADMIN'].includes(user?.role ?? '')
  const canChangePressStatus = ['MOULDING_SUPERVISOR', 'MANAGER', 'SYSTEM_ADMIN'].includes(user?.role ?? '')
  const canUpdateCurrentItem = ['MOULDING_OPERATOR', 'MOULDING_SUPERVISOR', 'MANAGER', 'SYSTEM_ADMIN'].includes(user?.role ?? '')
  const [presses, setPresses] = useState<Press[]>([])
  const [carts, setCarts] = useState<BlankingCart[]>([])
  const [shortages, setShortages] = useState<MaterialShortage[]>([])
  const [filters, setFilters] = useState({ press: '', date: '', shift: '', batch: '', status: '', blankingOperator: '', itemCode: '', compoundCode: '' })
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [itemDrafts, setItemDrafts] = useState<Record<number, string>>({})
  const [savingItemForPress, setSavingItemForPress] = useState<number | null>(null)
  const [receiptForm, setReceiptForm] = useState(initialReceiptForm)
  const [receivingCart, setReceivingCart] = useState(false)
  const [assignedCartsPressId, setAssignedCartsPressId] = useState<number | null>(null)
  const [cartToAssignId, setCartToAssignId] = useState('')
  const [assigningCart, setAssigningCart] = useState(false)

  const load = useCallback(async () => {
    try {
      const [pressData, cartData, shortageData] = await Promise.all([
        api<Press[]>('/api/moulding/presses'),
        api<BlankingCart[]>('/api/moulding/upcoming-carts'),
        api<MaterialShortage[]>('/api/shortages'),
      ])
      setPresses(pressData)
      setCarts(cartData)
      setShortages(shortageData)
      setError('')
    } catch (reason) { setError(displayError(reason)) }
  }, [])
  const connected = useRealtimeRefresh(load, TOPICS)
  const itemCodeOptions = useMemo(() => Array.from(new Set([
    ...presses.map((press) => press.currentItemCode),
    ...carts.map((cart) => cart.itemCode),
  ].filter((value): value is string => Boolean(value?.trim())))).sort((left, right) => left.localeCompare(right)), [carts, presses])
  const receivableCarts = useMemo(() => carts.filter((cart) => cart.status === 'DISPATCHED'), [carts])
  const selectedReceiptCart = useMemo(
    () => receivableCarts.find((cart) => cart.id === Number(receiptForm.cartId)),
    [receivableCarts, receiptForm.cartId],
  )
  const selectedReceiptPress = useMemo(
    () => presses.find((press) => press.id === Number(receiptForm.pressId)),
    [presses, receiptForm.pressId],
  )
  const pressChanged = Boolean(
    selectedReceiptCart && selectedReceiptPress
      && selectedReceiptCart.destinationPressId != null
      && selectedReceiptCart.destinationPressId !== selectedReceiptPress.id,
  )
  const selectedPressHasBlanks = (selectedReceiptPress?.availableBlankQuantity ?? 0) > 0
  const assignedCartsPress = useMemo(
    () => presses.find((press) => press.id === assignedCartsPressId),
    [assignedCartsPressId, presses],
  )
  const cartsAssignedToSelectedPress = useMemo(
    () => carts.filter((cart) => cart.destinationPressId === assignedCartsPressId),
    [assignedCartsPressId, carts],
  )
  const availableCartsToAssign = useMemo(
    () => carts.filter((cart) => cart.destinationPressId == null
      && ['PREPARED', 'READY_FOR_DISPATCH', 'DISPATCHED'].includes(cart.status)),
    [carts],
  )
  const selectedCartToAssign = useMemo(
    () => availableCartsToAssign.find((cart) => cart.id === Number(cartToAssignId)),
    [availableCartsToAssign, cartToAssignId],
  )
  const filteredCarts = useMemo(() => carts.filter((cart) => {
    const context = cartFactoryContext(cart.dispatchedAt ?? cart.createdAt)
    return (!filters.press || cart.destinationPressId === Number(filters.press))
      && (!filters.date || context.productionDate === filters.date)
      && (!filters.shift || context.shift === filters.shift)
      && (!filters.batch || cart.blankingBatchNumber.toLowerCase().includes(filters.batch.toLowerCase()))
      && (!filters.status || cart.status === filters.status)
      && (!filters.blankingOperator || cart.createdBy.fullName.toLowerCase().includes(filters.blankingOperator.toLowerCase()))
      && (!filters.itemCode || (cart.itemCode ?? '').toLowerCase().includes(filters.itemCode.toLowerCase()))
      && (!filters.compoundCode || cart.materialCode.toLowerCase().includes(filters.compoundCode.toLowerCase()))
  }), [carts, filters])

  const chooseCartForReceipt = (cart: BlankingCart) => {
    setReceiptForm({ cartId: String(cart.id), pressId: cart.destinationPressId == null ? '' : String(cart.destinationPressId), overrideReason: '' })
    setError('')
    document.getElementById('cart-press-allocation')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const changeReceiptCart = (cartId: string) => {
    const cart = receivableCarts.find((value) => value.id === Number(cartId))
    setReceiptForm({
      cartId,
      pressId: cart?.destinationPressId == null ? '' : String(cart.destinationPressId),
      overrideReason: '',
    })
  }

  const openAssignedCarts = (pressId: number) => {
    setAssignedCartsPressId(pressId)
    setCartToAssignId('')
    setError('')
  }

  const closeAssignedCarts = () => {
    if (assigningCart) return
    setAssignedCartsPressId(null)
    setCartToAssignId('')
  }

  const assignCart = async (event: FormEvent) => {
    event.preventDefault()
    if (!assignedCartsPress || !cartToAssignId) {
      setError('Select an available cart to assign.')
      return
    }
    if (!user?.employeeId?.trim()) {
      setError('Your account must have an EPF/employee number before assigning a cart.')
      return
    }
    const selectedCart = selectedCartToAssign
    if (!selectedCart) return
    const itemCheck = compareItemCodes(assignedCartsPress, selectedCart)
    const itemWarning = itemCheck.state === 'MATCH' ? 'Item codes match.'
      : itemCheck.state === 'MISMATCH'
        ? `WARNING: press item ${itemCheck.pressItem} does not match cart item ${itemCheck.cartItem}.`
        : `WARNING: item comparison is incomplete. Press: ${itemCheck.pressItem ?? 'Not saved'}; Cart: ${itemCheck.cartItem ?? 'TBC'}.`
    if (!window.confirm(`Assign ${selectedCart.cartNumber} to ${assignedCartsPress.pressNumber}?\n\n${itemWarning}`)) return
    setAssigningCart(true)
    setError('')
    try {
      await api<BlankingCart>(`/api/moulding/carts/${selectedCart.id}/assign`, {
        method: 'PATCH',
        body: JSON.stringify({ pressId: assignedCartsPress.id }),
      })
      setMessage(`${selectedCart.cartNumber} assigned to ${assignedCartsPress.pressNumber} by EPF ${user.employeeId}.`)
      setCartToAssignId('')
      await load()
    } catch (reason) {
      setError(displayError(reason))
    } finally {
      setAssigningCart(false)
    }
  }

  const receive = async (event: FormEvent) => {
    event.preventDefault()
    if (!user?.employeeId?.trim()) {
      setError('Your production operator account must have an EPF/employee number before receiving a cart.')
      return
    }
    if (!selectedReceiptCart || !selectedReceiptPress) {
      setError('Select both a dispatched Cart No. and the actual receiving Press No.')
      return
    }
    if (selectedPressHasBlanks) {
      setError(`${selectedReceiptPress.pressNumber} still has ${selectedReceiptPress.availableBlankQuantity} blanks available. Consume or return them and reconcile the press to 0 before receiving another cart.`)
      return
    }
    if (pressChanged && !receiptForm.overrideReason.trim()) {
      setError('Enter the reason for changing the cart from its originally planned press.')
      return
    }
    const itemCheck = compareItemCodes(selectedReceiptPress, selectedReceiptCart)
    const itemWarning = itemCheck.state === 'MATCH' ? 'Item codes match.'
      : itemCheck.state === 'MISMATCH'
        ? `WARNING: press item ${itemCheck.pressItem} does not match cart item ${itemCheck.cartItem}.`
        : `WARNING: item comparison is incomplete. Press: ${itemCheck.pressItem ?? 'Not saved'}; Cart: ${itemCheck.cartItem ?? 'TBC'}.`
    const allocationMessage = pressChanged
      ? `${selectedReceiptCart.cartNumber} was planned for ${selectedReceiptCart.destinationPressNumber}. Allocate and receive it at ${selectedReceiptPress.pressNumber} instead?`
      : `Allocate and receive ${selectedReceiptCart.cartNumber} at ${selectedReceiptPress.pressNumber}?`
    if (!window.confirm(`${allocationMessage}\n\n${itemWarning}\n\nThis receipt can be recorded only once.`)) return
    setReceivingCart(true)
    setError('')
    setMessage('')
    try {
      await api(`/api/moulding/carts/${selectedReceiptCart.id}/receive`, {
        method: 'POST',
        body: JSON.stringify({
          pressId: selectedReceiptPress.id,
          supervisorOverride: pressChanged,
          overrideReason: pressChanged ? receiptForm.overrideReason.trim() : null,
        }),
      })
      setMessage(`${selectedReceiptCart.cartNumber} received and allocated to ${selectedReceiptPress.pressNumber} by EPF ${user.employeeId}. ${selectedReceiptCart.quantity} blanks were added.`)
      setReceiptForm(initialReceiptForm)
      await load()
    } catch (reason) {
      setError(displayError(reason))
    } finally {
      setReceivingCart(false)
    }
  }

  const changePressStatus = async (press: Press, status: PressStatus) => {
    if (status === press.status) return
    const reason = ['STOPPED', 'MAINTENANCE'].includes(status)
      ? window.prompt(`Enter the required reason for changing ${press.pressNumber} to ${status.replace('_', ' ')}:`)
      : ''
    if (['STOPPED', 'MAINTENANCE'].includes(status) && !reason?.trim()) return
    if (!window.confirm(`Change ${press.pressNumber} from ${press.status} to ${status}?`)) return
    try {
      await api(`/api/moulding/presses/${press.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status, reason }),
      })
      setMessage(`${press.pressNumber} status changed to ${status.replaceAll('_', ' ')}.`)
      await load()
    } catch (reasonValue) { setError(displayError(reasonValue)) }
  }

  const updateCurrentItem = async (press: Press) => {
    const itemCode = (itemDrafts[press.id] ?? press.currentItemCode ?? '').trim()
    if (itemCode === (press.currentItemCode ?? '')) return
    if (!window.confirm(itemCode
      ? `Set ${itemCode} as the ongoing item on ${press.pressNumber}?`
      : `Clear the ongoing item from ${press.pressNumber}?`)) return
    setSavingItemForPress(press.id)
    setError('')
    try {
      await api(`/api/moulding/presses/${press.id}/current-item`, {
        method: 'PATCH',
        body: JSON.stringify({ itemCode }),
      })
      setItemDrafts((current) => {
        const next = { ...current }
        delete next[press.id]
        return next
      })
      setMessage(`${press.pressNumber} ongoing item ${itemCode ? `set to ${itemCode}` : 'cleared'}.`)
      await load()
    } catch (reason) {
      setError(displayError(reason))
    } finally {
      setSavingItemForPress(null)
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Moulding live view"
        title="Press inventory and incoming carts"
        description="Moulding receives dispatched carts exactly once. The server records receipt time, shift and operator identity."
        actions={<LiveIndicator connected={connected} />}
      />
      {error && <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      {message && <div role="status" className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{message}</div>}

      <datalist id="moulding-item-codes">
        {itemCodeOptions.map((itemCode) => <option key={itemCode} value={itemCode} />)}
      </datalist>

      <div className="mb-7 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {presses.map((press) => (
          <article key={press.id} className="card p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3"><div className="grid h-12 w-12 place-items-center rounded-xl bg-blue-100 text-process"><Factory size={23} /></div><div><h2 className="text-xl font-black text-ink">{press.pressNumber}</h2><p className="text-sm text-slate-500">{press.pressName}</p></div></div>
              {canChangePressStatus ? (
                <select
                  className="field w-44"
                  value={press.status}
                  onChange={(event) => void changePressStatus(press, event.target.value as PressStatus)}
                  aria-label={`Change ${press.pressNumber} status`}
                >
                  {['IDLE', 'WAITING_FOR_BLANKS', 'RUNNING', 'STOPPED', 'MAINTENANCE'].map((status) => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}
                </select>
              ) : <StatusBadge status={press.status} />}
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-slate-50 p-3"><p className="text-2xl font-black">{press.availableBlankQuantity}</p><p className="text-xs text-slate-500">Blanks available</p></div>
              <div className="rounded-xl bg-slate-50 p-3"><p className="text-2xl font-black">{press.cartsWaitingToBeReceived}</p><p className="text-xs text-slate-500">Carts incoming</p><button type="button" className="mt-2 text-xs font-black text-process underline decoration-blue-300 underline-offset-2" onClick={() => openAssignedCarts(press.id)}>Assigned carts</button></div>
              <div className="rounded-xl bg-emerald-50 p-3"><p className="text-2xl font-black text-emerald-700">{press.goodTyreQuantity}</p><p className="text-xs text-emerald-700">Good tyres</p></div>
              <div className="rounded-xl bg-red-50 p-3"><p className="text-2xl font-black text-red-700">{press.rejectedTyreQuantity + press.rejectedBlankQuantity}</p><p className="text-xs text-red-700">Total rejected</p></div>
            </div>
            {press.availableBlankQuantity > 0 && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">New cart receipt blocked until Blanks Available is reconciled to 0.</p>}
            <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50/60 p-3">
              <label htmlFor={`press-item-${press.id}`} className="label">Ongoing item code</label>
              {canUpdateCurrentItem ? (
                <div className="mt-1 flex gap-2">
                  <input
                    id={`press-item-${press.id}`}
                    className="field min-w-0 flex-1 bg-white font-bold uppercase"
                    list="moulding-item-codes"
                    maxLength={100}
                    value={itemDrafts[press.id] ?? press.currentItemCode ?? ''}
                    onChange={(event) => setItemDrafts((current) => ({ ...current, [press.id]: event.target.value }))}
                    onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void updateCurrentItem(press) } }}
                    placeholder="Select or enter, e.g. UG500x50"
                  />
                  <button
                    type="button"
                    className="btn-primary shrink-0 px-3"
                    disabled={savingItemForPress === press.id || (itemDrafts[press.id] ?? press.currentItemCode ?? '').trim() === (press.currentItemCode ?? '')}
                    onClick={() => void updateCurrentItem(press)}
                  >{savingItemForPress === press.id ? 'Saving…' : 'Save'}</button>
                </div>
              ) : <p id={`press-item-${press.id}`} className="mt-1 font-black text-ink">{press.currentItemCode ?? 'Not selected'}</p>}
              <p className="mt-1 text-xs text-slate-500">Choose a previous item from the dropdown or type a new item code.</p>
            </div>
            <div className="mt-4 grid gap-1 text-xs text-slate-500">
              <p>Shift: <span className="font-bold text-slate-700">{press.currentShift.replace('_', ' ')}</span></p>
              <p>Operator: <span className="font-bold text-slate-700">{press.currentOperator?.fullName ?? 'Not assigned'}</span></p>
              <p>Current batch: <span className="font-bold text-slate-700">{press.currentBlankingBatchNumber ?? 'None'}</span></p>
              <p>Consumed/output recorded: <span className="font-bold text-slate-700">{press.goodTyreQuantity + press.rejectedTyreQuantity + press.rejectedBlankQuantity}</span></p>
              <p>Estimated next requirement: <span className="font-bold text-slate-700">{press.estimatedNextBlankRequirement} blanks</span></p>
              <p>Open notes: <span className="font-bold text-slate-700">{shortages.filter((item) => item.pressId === press.id && !['FULFILLED', 'CANCELLED'].includes(item.status)).length}</span>{shortages.some((item) => item.pressId === press.id && item.priority === 'URGENT' && !['FULFILLED', 'CANCELLED'].includes(item.status)) && <span className="ml-2 font-black text-red-700">URGENT</span>}</p>
              <p>Last activity: <span className="font-bold text-slate-700">{formatDateTime(press.lastActivityAt)}</span></p>
            </div>
            {canOpenProduction && (
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                <Link to={`/moulding/production?press=${press.id}`} className="btn-primary justify-center"><PencilLine size={17} /> Production Entry</Link>
                <Link to={`/moulding/returns?press=${press.id}`} className="btn-secondary justify-center"><ArrowLeftRight size={17} /> Rejects / Returns</Link>
              </div>
            )}
          </article>
        ))}
      </div>

      {assignedCartsPress && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="assigned-carts-title">
          <section className="card my-auto w-full max-w-3xl overflow-hidden">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5 sm:p-6">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-process">{assignedCartsPress.pressNumber}</p>
                <h2 id="assigned-carts-title" className="mt-1 text-xl font-black text-ink">Assigned carts</h2>
                <p className="mt-1 text-sm text-slate-500">View carts planned for this press or assign an available cart.</p>
              </div>
              <button type="button" className="btn-secondary px-3" onClick={closeAssignedCarts} aria-label="Close assigned carts"><X size={18} /></button>
            </div>

            <div className="max-h-[72vh] overflow-y-auto p-5 sm:p-6">
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="production-table">
                  <thead><tr><th>Item compatibility</th><th>Cart</th><th>Qty</th><th>Status</th></tr></thead>
                  <tbody>
                    {cartsAssignedToSelectedPress.length === 0 ? (
                      <tr><td colSpan={4} className="py-8 text-center text-sm text-slate-500">No upcoming carts are assigned to this press.</td></tr>
                    ) : cartsAssignedToSelectedPress.map((cart) => (
                      <tr key={cart.id}>
                        <td><ItemCompatibilityNotice press={assignedCartsPress} cart={cart} compact /></td>
                        <td className="font-black">{cart.cartNumber}<p className="text-xs font-normal text-slate-500">{cart.blankingBatchNumber}</p></td>
                        <td>{cart.quantity} pieces<p className="text-xs text-slate-500">{cart.materialWeightKg ?? '—'} kg</p></td>
                        <td><StatusBadge status={cart.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {canAssignCarts && (
                <form onSubmit={assignCart} className="mt-5 rounded-2xl border border-blue-200 bg-blue-50/60 p-4">
                  <label><span className="label">Available cart</span><select className="field bg-white" required value={cartToAssignId} onChange={(event) => setCartToAssignId(event.target.value)}><option value="">Select an unassigned cart</option>{availableCartsToAssign.map((cart) => { const check = compareItemCodes(assignedCartsPress, cart); return <option key={cart.id} value={cart.id}>{check.state === 'MATCH' ? 'MATCH' : check.state === 'MISMATCH' ? 'MISMATCH' : 'ITEM TBC'} · {cart.itemCode ?? 'Item TBC'} · {cart.cartNumber} · {cart.quantity} blanks</option> })}</select></label>
                  {selectedCartToAssign && <div className="mt-4"><ItemCompatibilityNotice press={assignedCartsPress} cart={selectedCartToAssign} /></div>}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-slate-600">Assignment records your EPF. Physical receipt is still blocked while this press has blanks available.</p>
                    <button className="btn-primary" disabled={assigningCart || !cartToAssignId || !user?.employeeId}><Truck size={17} /> {assigningCart ? 'Assigning…' : `Assign to ${assignedCartsPress.pressNumber}`}</button>
                  </div>
                  {availableCartsToAssign.length === 0 && <p className="mt-3 text-xs font-bold text-amber-700">No unassigned carts are currently available.</p>}
                </form>
              )}
            </div>
          </section>
        </div>
      )}

      {canReceive && (
        <section id="cart-press-allocation" className="card mb-7 scroll-mt-5 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-5 py-5 sm:px-6">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-blue-100 text-process"><ArrowRightLeft size={21} /></div>
              <div><h2 className="text-lg font-black text-ink">Receive cart and allocate press</h2><p className="mt-1 text-xs text-slate-500">Select the physical Cart No. and the Press No. where it is actually received.</p></div>
            </div>
            <div className={`rounded-xl px-3 py-2 text-xs font-bold ${user?.employeeId ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
              {user?.employeeId ? `Operator EPF: ${user.employeeId}` : 'Operator EPF is missing'}
            </div>
          </div>

          <form onSubmit={receive} className="p-5 sm:p-6">
            <div className="grid gap-4 lg:grid-cols-3">
              <label><span className="label">Cart No.</span><select className="field" required value={receiptForm.cartId} onChange={(event) => changeReceiptCart(event.target.value)}><option value="">Select dispatched cart</option>{receivableCarts.map((cart) => <option key={cart.id} value={cart.id}>{cart.cartNumber} · {cart.blankingBatchNumber} · {cart.quantity} blanks</option>)}</select></label>
              <label><span className="label">Press No.</span><select className="field" required value={receiptForm.pressId} onChange={(event) => setReceiptForm({ ...receiptForm, pressId: event.target.value, overrideReason: '' })}><option value="">Select actual receiving press</option>{presses.filter((press) => press.active).map((press) => <option key={press.id} value={press.id} disabled={press.availableBlankQuantity > 0}>{press.pressNumber} · {press.pressName} · {press.availableBlankQuantity === 0 ? 'Available' : `${press.availableBlankQuantity} blanks remaining`}</option>)}</select></label>
              <label><span className="label">Production operator / EPF</span><input className="field bg-slate-50 font-bold" disabled value={user?.employeeId ? `${user.fullName} · EPF ${user.employeeId}` : `${user?.fullName ?? 'Unknown operator'} · EPF missing`} /></label>
            </div>

            {selectedReceiptCart && (
              <div className="mt-5 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 xl:grid-cols-6">
                <div><p className="text-[11px] font-bold uppercase text-slate-400">Cart No.</p><p className="mt-1 font-black text-ink">{selectedReceiptCart.cartNumber}</p></div>
                <div><p className="text-[11px] font-bold uppercase text-slate-400">Batch / compound</p><p className="mt-1 font-black text-ink">{selectedReceiptCart.blankingBatchNumber}</p><p className="text-xs text-slate-500">{selectedReceiptCart.materialCode}</p></div>
                <div><p className="text-[11px] font-bold uppercase text-slate-400">Item code</p><p className="mt-1 font-black text-ink">{selectedReceiptCart.itemCode ?? 'TBC'}</p></div>
                <div><p className="text-[11px] font-bold uppercase text-slate-400">Cart quantity</p><p className="mt-1 font-black text-ink">{selectedReceiptCart.quantity} blanks</p><p className="text-xs text-slate-500">{selectedReceiptCart.materialWeightKg ?? '—'} kg</p></div>
                <div><p className="text-[11px] font-bold uppercase text-slate-400">Press before receipt</p><p className="mt-1 font-black text-ink">{selectedReceiptCart.destinationPressNumber ?? 'Not preassigned'}</p></div>
                <div><p className="text-[11px] font-bold uppercase text-slate-400">Actual selected press</p><p className={`mt-1 font-black ${selectedPressHasBlanks ? 'text-red-700' : pressChanged ? 'text-amber-700' : 'text-emerald-700'}`}>{selectedReceiptPress?.pressNumber ?? 'Select press'}</p><p className="text-xs text-slate-500">{selectedReceiptPress ? `${selectedReceiptPress.availableBlankQuantity} blanks available` : 'Must have 0 blanks'}</p></div>
              </div>
            )}

            {selectedReceiptCart && selectedReceiptPress && (
              <div className="mt-4"><ItemCompatibilityNotice press={selectedReceiptPress} cart={selectedReceiptCart} /></div>
            )}

            {selectedPressHasBlanks && selectedReceiptPress && (
              <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
                {selectedReceiptPress.pressNumber} cannot receive this cart because it still has {selectedReceiptPress.availableBlankQuantity} blanks. Complete production or return/reconcile the remaining blanks until the value is 0.
              </div>
            )}

            {pressChanged && selectedReceiptCart && selectedReceiptPress && (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-bold text-amber-900">Press allocation changed: {selectedReceiptCart.destinationPressNumber} → {selectedReceiptPress.pressNumber}</p>
                <label className="mt-3 block"><span className="label text-amber-900">Required change reason</span><textarea className="field min-h-20 bg-white" required maxLength={1000} value={receiptForm.overrideReason} onChange={(event) => setReceiptForm({ ...receiptForm, overrideReason: event.target.value })} placeholder="Explain why this cart is being received at a different press." /></label>
              </div>
            )}

            {!user?.employeeId && <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">Receipt is blocked because this account has no EPF/employee number. A System Administrator must update the account first.</div>}

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-xs text-slate-500"><ShieldCheck size={16} /> Receipt requires 0 existing blanks and records Cart No., selected press, EPF, date, shift and time.</p>
              <button className="btn-primary" disabled={receivingCart || !user?.employeeId || !selectedReceiptCart || !selectedReceiptPress || selectedPressHasBlanks || (pressChanged && !receiptForm.overrideReason.trim())}><Truck size={17} /> {receivingCart ? 'Receiving…' : 'Confirm receipt & allocation'}</button>
            </div>
          </form>
        </section>
      )}

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div><h2 className="font-black text-ink">Upcoming carts</h2><p className="text-xs text-slate-500">Dispatched by Blanking and awaiting physical receipt</p></div>
          {canOpenProduction && <Link to="/moulding/production" className="btn-primary"><CircleDot size={17} /> Production records</Link>}
        </div>
        <div className="grid gap-3 border-b border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
          <label><span className="label">Press</span><select className="field" value={filters.press} onChange={(e) => setFilters({ ...filters, press: e.target.value })}><option value="">All presses</option>{presses.map((press) => <option key={press.id} value={press.id}>{press.pressNumber}</option>)}</select></label>
          <label><span className="label">Production date</span><input className="field" type="date" value={filters.date} onChange={(e) => setFilters({ ...filters, date: e.target.value })} /></label>
          <label><span className="label">Shift</span><select className="field" value={filters.shift} onChange={(e) => setFilters({ ...filters, shift: e.target.value })}><option value="">All shifts</option><option value="SHIFT_A">Shift A</option><option value="SHIFT_B">Shift B</option><option value="SHIFT_C">Shift C</option></select></label>
          <label><span className="label">Batch number</span><input className="field" value={filters.batch} onChange={(e) => setFilters({ ...filters, batch: e.target.value })} /></label>
          <label><span className="label">Cart status</span><select className="field" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="">All statuses</option><option value="PREPARED">Prepared</option><option value="HELD">Held</option><option value="READY_FOR_DISPATCH">Ready</option><option value="DISPATCHED">Dispatched</option></select></label>
          <label><span className="label">Blanking operator</span><input className="field" value={filters.blankingOperator} onChange={(e) => setFilters({ ...filters, blankingOperator: e.target.value })} /></label>
          <label><span className="label">Item code</span><input className="field" value={filters.itemCode} onChange={(e) => setFilters({ ...filters, itemCode: e.target.value })} /></label>
          <label><span className="label">Compound code</span><input className="field" value={filters.compoundCode} onChange={(e) => setFilters({ ...filters, compoundCode: e.target.value })} /></label>
        </div>
        {filteredCarts.length === 0 ? (
          <div className="grid min-h-56 place-items-center text-center"><div><PackageCheck className="mx-auto text-slate-300" size={34} /><p className="mt-3 font-bold">No carts waiting</p><p className="text-sm text-slate-500">All dispatched carts have been received.</p></div></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="production-table">
              <thead><tr><th>Press No.</th><th>Item</th><th>Cart</th><th>Qty</th><th>Blanking trace</th><th>Blanking operator / time</th><th>Note / status</th><th>Receipt & allocation</th></tr></thead>
              <tbody>{filteredCarts.map((cart) => (
                <tr key={cart.id}>
                  <td className="font-black">{cart.destinationPressNumber ?? 'Select at receipt'}</td>
                  <td className="font-black">{cart.itemCode ?? 'Item TBC'}</td>
                  <td className="font-black">{cart.cartNumber}</td>
                  <td className="font-black">{cart.quantity} pieces<p className="text-xs font-normal text-slate-500">{cart.materialWeightKg ?? '—'} kg</p></td>
                  <td>{cart.blankingBatchNumber}<p className="text-xs text-slate-500">{cart.mixingBatchNumber} · {cart.materialCode}</p></td>
                  <td>{cart.dispatchedBy?.fullName ?? cart.createdBy.fullName}<p className="text-xs text-slate-500">{formatDateTime(cart.dispatchedAt ?? cart.createdAt)}</p></td>
                  <td><p className="mb-1 max-w-xs text-xs text-slate-500">{cart.status === 'HELD' ? cart.holdReason : cart.blankingNote}</p><StatusBadge status={cart.status} /></td>
                  <td>{canReceive && cart.status === 'DISPATCHED' ? <button type="button" className="btn-primary" onClick={() => chooseCartForReceipt(cart)}><ArrowRightLeft size={17} /> Select cart</button> : <span className="text-xs text-slate-400">{cart.status === 'HELD' ? 'Held in Blanking' : cart.status === 'PREPARED' || cart.status === 'READY_FOR_DISPATCH' ? 'Awaiting dispatch' : 'Read only'}</span>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
      <div className="mt-5 flex flex-wrap gap-3"><Link to="/shortages" className="btn-secondary"><Boxes size={17} /> Shortage requests</Link>{canViewManagerReport && <Link to="/production-manager" className="btn-secondary">Manager report</Link>}</div>
    </div>
  )
}
