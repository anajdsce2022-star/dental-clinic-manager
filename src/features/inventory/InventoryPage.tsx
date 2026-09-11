import { useEffect, useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  History,
  Package,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react'

type InventoryItem = {
  id: string
  name: string
  category: string
  quantity: number
  unit: string
  minimumStock: number
  purchasePricePaise: number
  supplier: string
  expiryDate: string
  createdAt: string
  updatedAt: string
  archivedAt?: string
}

type StockActionType =
  | 'Opening stock'
  | 'Stock added'
  | 'Stock used'
  | 'Stock adjusted'

type StockAction = {
  id: string
  itemId: string
  type: StockActionType
  quantity: number
  previousQuantity: number
  newQuantity: number
  date: string
  note: string
  reference: string
}

type ItemForm = {
  name: string
  category: string
  quantity: string
  unit: string
  minimumStock: string
  purchasePrice: string
  supplier: string
  expiryDate: string
}

type StockForm = {
  quantity: string
  note: string
  reference: string
}

type Dialog =
  | {
      type: 'delete'
      item: InventoryItem
    }
  | {
      type: 'restore'
      item: InventoryItem
    }
  | null

type Notice = {
  type: 'success' | 'error'
  message: string
} | null

const ITEMS_KEY = 'joshi-dental-clinic-inventory'
const HISTORY_KEY = 'joshi-dental-clinic-inventory-history'

const DATA_VERSION = 2

const EXPIRING_SOON_DAYS = 30

const emptyForm: ItemForm = {
  name: '',
  category: '',
  quantity: '0',
  unit: 'pieces',
  minimumStock: '5',
  purchasePrice: '0',
  supplier: '',
  expiryDate: '',
}

const emptyStockForm: StockForm = {
  quantity: '1',
  note: '',
  reference: '',
}

const DEFAULT_CATEGORIES = [
  'Medicines',
  'Consumables',
  'Filling Materials',
  'Endodontics',
  'Prosthodontics',
  'Implantology',
  'PPE',
  'Equipment',
  'Other',
]

const UNITS = [
  'pieces',
  'boxes',
  'packs',
  'bottles',
  'tubes',
  'sets',
  'pairs',
  'ml',
  'litres',
  'grams',
  'kg',
  'units',
]

function sanitizeQuantityInput(value: string) {
  const sanitized = value.replace(/[^\d.]/g, '')
  const parts = sanitized.split('.')

  if (parts.length <= 1) {
    return sanitized
  }

  return `${parts[0]}.${parts.slice(1).join('')}`
}

function sanitizePriceInput(value: string) {
  const sanitized = value.replace(/[^\d.]/g, '')
  const parts = sanitized.split('.')

  if (parts.length <= 1) {
    return sanitized
  }

  const decimals = parts.slice(1).join('').slice(0, 2)

  return `${parts[0]}.${decimals}`
}

function numberValue(value: string) {
  if (value.trim() === '') return 0

  const parsed = Number(value)

  return Number.isFinite(parsed) ? parsed : 0
}

function roundQuantity(value: number) {
  return Math.round(value * 1000) / 1000
}

function rupeesToPaise(value: number) {
  return Math.round(value * 100)
}

function paiseToRupees(value: number) {
  return value / 100
}

function formatCurrencyFromPaise(paise: number) {
  return `₹${paiseToRupees(paise).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatQuantity(value: number) {
  return value.toLocaleString('en-IN', {
    maximumFractionDigits: 3,
  })
}

function formatDate(date: string) {
  if (!date) return '—'

  const parsed = new Date(`${date}T00:00:00`)

  if (Number.isNaN(parsed.getTime())) {
    return date
  }

  return parsed.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function formatDateTime(date: string) {
  const parsed = new Date(date)

  if (Number.isNaN(parsed.getTime())) {
    return date
  }

  return parsed.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

function isLowStock(item: InventoryItem) {
  return item.quantity <= item.minimumStock
}

function getExpiryStatus(item: InventoryItem) {
  if (!item.expiryDate) {
    return 'none' as const
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const expiry = new Date(`${item.expiryDate}T00:00:00`)

  if (Number.isNaN(expiry.getTime())) {
    return 'invalid' as const
  }

  if (expiry < today) {
    return 'expired' as const
  }

  const diffMs = expiry.getTime() - today.getTime()
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays <= EXPIRING_SOON_DAYS) {
    return 'soon' as const
  }

  return 'good' as const
}

function isValidInventoryItem(value: unknown): value is InventoryItem {
  if (!value || typeof value !== 'object') return false

  const item = value as Partial<InventoryItem>

  return (
    typeof item.id === 'string' &&
    typeof item.name === 'string' &&
    typeof item.category === 'string' &&
    typeof item.quantity === 'number' &&
    Number.isFinite(item.quantity) &&
    item.quantity >= 0 &&
    typeof item.unit === 'string' &&
    typeof item.minimumStock === 'number' &&
    Number.isFinite(item.minimumStock) &&
    item.minimumStock >= 0 &&
    typeof item.purchasePricePaise === 'number' &&
    Number.isInteger(item.purchasePricePaise) &&
    item.purchasePricePaise >= 0 &&
    typeof item.supplier === 'string' &&
    typeof item.expiryDate === 'string' &&
    typeof item.createdAt === 'string' &&
    typeof item.updatedAt === 'string'
  )
}

function isValidStockAction(value: unknown): value is StockAction {
  if (!value || typeof value !== 'object') return false

  const action = value as Partial<StockAction>

  return (
    typeof action.id === 'string' &&
    typeof action.itemId === 'string' &&
    typeof action.type === 'string' &&
    typeof action.quantity === 'number' &&
    Number.isFinite(action.quantity) &&
    action.quantity >= 0 &&
    typeof action.previousQuantity === 'number' &&
    Number.isFinite(action.previousQuantity) &&
    action.previousQuantity >= 0 &&
    typeof action.newQuantity === 'number' &&
    Number.isFinite(action.newQuantity) &&
    action.newQuantity >= 0 &&
    typeof action.date === 'string' &&
    typeof action.note === 'string' &&
    typeof action.reference === 'string'
  )
}

function migrateInventoryItems(raw: unknown): {
  items: InventoryItem[]
  migrated: boolean
} {
  if (!Array.isArray(raw)) {
    return {
      items: [],
      migrated: false,
    }
  }

  let migrated = false

  const items = raw
    .filter((item): item is Record<string, unknown> => {
      return Boolean(item) && typeof item === 'object'
    })
    .map((item) => {
      if (isValidInventoryItem(item)) {
        return item
      }

      const quantity =
        typeof item.quantity === 'number' && Number.isFinite(item.quantity)
          ? Math.max(0, roundQuantity(item.quantity))
          : 0

      const minimumStock =
        typeof item.minimumStock === 'number' &&
        Number.isFinite(item.minimumStock)
          ? Math.max(0, roundQuantity(item.minimumStock))
          : 5

      const oldPurchasePrice =
        typeof item.purchasePrice === 'number' &&
        Number.isFinite(item.purchasePrice)
          ? Math.max(0, item.purchasePrice)
          : 0

      const now = new Date().toISOString()

      migrated = true

      return {
        id:
          typeof item.id === 'string' && item.id
            ? item.id
            : crypto.randomUUID(),
        name: typeof item.name === 'string' ? item.name.trim() : '',
        category:
          typeof item.category === 'string' ? item.category.trim() : 'Other',
        quantity,
        unit: typeof item.unit === 'string' ? item.unit : 'pieces',
        minimumStock,
        purchasePricePaise:
          typeof item.purchasePricePaise === 'number' &&
          Number.isInteger(item.purchasePricePaise)
            ? Math.max(0, item.purchasePricePaise)
            : rupeesToPaise(oldPurchasePrice),
        supplier:
          typeof item.supplier === 'string' ? item.supplier.trim() : '',
        expiryDate:
          typeof item.expiryDate === 'string' ? item.expiryDate : '',
        createdAt:
          typeof item.createdAt === 'string' ? item.createdAt : now,
        updatedAt:
          typeof item.updatedAt === 'string' ? item.updatedAt : now,
        archivedAt:
          typeof item.archivedAt === 'string'
            ? item.archivedAt
            : undefined,
      }
    })
    .filter((item) => item.name)

  return {
    items,
    migrated,
  }
}

function migrateHistory(raw: unknown): {
  history: StockAction[]
  migrated: boolean
} {
  if (!Array.isArray(raw)) {
    return {
      history: [],
      migrated: false,
    }
  }

  let migrated = false

  const history = raw
    .filter((entry): entry is Record<string, unknown> => {
      return Boolean(entry) && typeof entry === 'object'
    })
    .map((entry) => {
      if (isValidStockAction(entry)) {
        return entry
      }

      migrated = true

      const quantity =
        typeof entry.quantity === 'number' && Number.isFinite(entry.quantity)
          ? Math.max(0, roundQuantity(entry.quantity))
          : 0

      const type =
        entry.type === 'Stock added'
          ? 'Stock added'
          : entry.type === 'Stock used'
            ? 'Stock used'
            : 'Stock adjusted'

      const date =
        typeof entry.date === 'string'
          ? entry.date
          : new Date().toISOString()

      return {
        id:
          typeof entry.id === 'string' && entry.id
            ? entry.id
            : crypto.randomUUID(),
        itemId:
          typeof entry.itemId === 'string' ? entry.itemId : '',
        type,
        quantity,
        previousQuantity: 0,
        newQuantity: 0,
        date,
        note: typeof entry.note === 'string' ? entry.note : '',
        reference: '',
      } satisfies StockAction
    })
    .filter((entry) => entry.itemId)

  return {
    history,
    migrated,
  }
}

function getDaysUntilExpiry(item: InventoryItem) {
  if (!item.expiryDate) return null

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const expiry = new Date(`${item.expiryDate}T00:00:00`)

  if (Number.isNaN(expiry.getTime())) return null

  return Math.ceil(
    (expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  )
}

function loadInventoryItems() {
  try {
    const savedItems = localStorage.getItem(ITEMS_KEY)

    if (!savedItems) return []

    return migrateInventoryItems(JSON.parse(savedItems)).items
  } catch {
    return []
  }
}

function loadInventoryHistory() {
  try {
    const savedHistory = localStorage.getItem(HISTORY_KEY)

    if (!savedHistory) return []

    return migrateHistory(JSON.parse(savedHistory)).history
  } catch {
    return []
  }
}

export function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>(loadInventoryItems)
  const [history, setHistory] = useState<StockAction[]>(loadInventoryHistory)

  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('Active')

  const [showForm, setShowForm] = useState(false)
  const [showStockModal, setShowStockModal] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null)
  const [stockItem, setStockItem] = useState<InventoryItem | null>(null)
  const [stockType, setStockType] = useState<
    'add' | 'use' | 'adjust'
  >('add')

  const [form, setForm] = useState<ItemForm>(emptyForm)
  const [stockForm, setStockForm] = useState<StockForm>(emptyStockForm)

  const [dialog, setDialog] = useState<Dialog>(null)
  const [notice, setNotice] = useState<Notice>(null)

  const [storageError, setStorageError] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem(ITEMS_KEY, JSON.stringify(items))
    } catch {
      window.setTimeout(() => setStorageError(true), 0)
    }
  }, [items])

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history))
    } catch {
      window.setTimeout(() => setStorageError(true), 0)
    }
  }, [history])

  useEffect(() => {
    try {
      localStorage.setItem(
        `${ITEMS_KEY}-version`,
        String(DATA_VERSION),
      )
    } catch {
      window.setTimeout(() => setStorageError(true), 0)
    }
  }, [])

  useEffect(() => {
    if (!notice) return

    const timer = window.setTimeout(() => {
      setNotice(null)
    }, 4500)

    return () => window.clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return

      if (dialog) {
        setDialog(null)
        return
      }

      if (showStockModal) {
        closeStockModal()
        return
      }

      if (showForm) {
        closeForm()
        return
      }

      if (showHistory) {
        setShowHistory(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  })

  const activeItems = useMemo(
    () => items.filter((item) => !item.archivedAt),
    [items],
  )

  const categories = useMemo(() => {
    const values = new Set<string>(DEFAULT_CATEGORIES)

    items.forEach((item) => {
      if (item.category.trim()) {
        values.add(item.category.trim())
      }
    })

    return ['All', ...Array.from(values).sort()]
  }, [items])

  const filteredItems = useMemo(() => {
    const searchTerm = normalizeText(search)

    return items.filter((item) => {
      const matchesArchive =
        statusFilter === 'Active'
          ? !item.archivedAt
          : statusFilter === 'Archived'
            ? Boolean(item.archivedAt)
            : true

      if (!matchesArchive) return false

      const matchesSearch =
        !searchTerm ||
        normalizeText(item.name).includes(searchTerm) ||
        normalizeText(item.category).includes(searchTerm) ||
        normalizeText(item.supplier).includes(searchTerm)

      const matchesCategory =
        categoryFilter === 'All' || item.category === categoryFilter

      return matchesSearch && matchesCategory
    })
  }, [items, search, categoryFilter, statusFilter])

  const totalItems = activeItems.length

  const lowStockCount = activeItems.filter(
    (item) => item.quantity > 0 && isLowStock(item),
  ).length

  const outOfStockCount = activeItems.filter(
    (item) => item.quantity === 0,
  ).length

  const expiredCount = activeItems.filter(
    (item) => getExpiryStatus(item) === 'expired',
  ).length

  const expiringSoonCount = activeItems.filter(
    (item) => getExpiryStatus(item) === 'soon',
  ).length

  const totalStockValuePaise = activeItems.reduce(
    (total, item) =>
      total + Math.round(item.quantity * item.purchasePricePaise),
    0,
  )

  function showSuccess(message: string) {
    setNotice({
      type: 'success',
      message,
    })
  }

  function showError(message: string) {
    setNotice({
      type: 'error',
      message,
    })
  }

  function openAddItem() {
    setEditingItem(null)
    setForm(emptyForm)
    setShowForm(true)
  }

  function openEditItem(item: InventoryItem) {
    setEditingItem(item)

    setForm({
      name: item.name,
      category: item.category,
      quantity: String(item.quantity),
      unit: item.unit,
      minimumStock: String(item.minimumStock),
      purchasePrice: String(paiseToRupees(item.purchasePricePaise)),
      supplier: item.supplier,
      expiryDate: item.expiryDate,
    })

    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingItem(null)
    setForm(emptyForm)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const name = form.name.trim().replace(/\s+/g, ' ')
    const category = form.category.trim().replace(/\s+/g, ' ')
    const unit = form.unit.trim() || 'pieces'
    const supplier = form.supplier.trim().replace(/\s+/g, ' ')

    const quantity = roundQuantity(numberValue(form.quantity))
    const minimumStock = roundQuantity(numberValue(form.minimumStock))
    const purchasePrice = numberValue(form.purchasePrice)

    if (!name) {
      showError('Please enter the item name.')
      return
    }

    if (!category) {
      showError('Please enter the category.')
      return
    }

    if (!Number.isFinite(quantity) || quantity < 0) {
      showError('Quantity must be zero or greater.')
      return
    }

    if (!Number.isFinite(minimumStock) || minimumStock < 0) {
      showError('Minimum stock must be zero or greater.')
      return
    }

    if (
      !Number.isFinite(purchasePrice) ||
      purchasePrice < 0 ||
      purchasePrice > 100000000
    ) {
      showError('Please enter a valid purchase price.')
      return
    }

    if (form.expiryDate) {
      const expiry = new Date(`${form.expiryDate}T00:00:00`)

      if (Number.isNaN(expiry.getTime())) {
        showError('Please enter a valid expiry date.')
        return
      }
    }

    const duplicate = activeItems.find((item) => {
      if (editingItem && item.id === editingItem.id) {
        return false
      }

      return (
        normalizeText(item.name) === normalizeText(name) &&
        normalizeText(item.category) === normalizeText(category)
      )
    })

    if (duplicate) {
      showError(
        `"${duplicate.name}" already exists in this category. Edit the existing item instead.`,
      )
      return
    }

    const now = new Date().toISOString()
    const purchasePricePaise = rupeesToPaise(purchasePrice)

    if (editingItem) {
      setItems((current) =>
        current.map((item) =>
          item.id === editingItem.id
            ? {
                ...item,
                name,
                category,
                unit,
                minimumStock,
                purchasePricePaise,
                supplier,
                expiryDate: form.expiryDate,
                updatedAt: now,
              }
            : item,
        ),
      )

      /*
       * IMPORTANT:
       * Quantity intentionally does NOT get updated here.
       *
       * Stock must only change through a stock transaction.
       */
      closeForm()
      showSuccess('Inventory item updated.')
      return
    }

    const newItem: InventoryItem = {
      id: crypto.randomUUID(),
      name,
      category,
      quantity,
      unit,
      minimumStock,
      purchasePricePaise,
      supplier,
      expiryDate: form.expiryDate,
      createdAt: now,
      updatedAt: now,
    }

    setItems((current) => [newItem, ...current])

    if (quantity > 0) {
      const openingStock: StockAction = {
        id: crypto.randomUUID(),
        itemId: newItem.id,
        type: 'Opening stock',
        quantity,
        previousQuantity: 0,
        newQuantity: quantity,
        date: now,
        note: 'Initial stock entered when item was created.',
        reference: '',
      }

      setHistory((current) => [openingStock, ...current])
    }

    closeForm()
    showSuccess('Inventory item added.')
  }

  function requestDelete(item: InventoryItem) {
    setDialog({
      type: 'delete',
      item,
    })
  }

  function confirmDelete() {
    if (!dialog || dialog.type !== 'delete') return

    const item = dialog.item
    const now = new Date().toISOString()

    setItems((current) =>
      current.map((entry) =>
        entry.id === item.id
          ? {
              ...entry,
              archivedAt: now,
              updatedAt: now,
            }
          : entry,
      ),
    )

    /*
     * History is deliberately preserved.
     * We NEVER delete stock history when an item is archived.
     */
    setDialog(null)

    showSuccess(`"${item.name}" was archived.`)
  }

  function requestRestore(item: InventoryItem) {
    setDialog({
      type: 'restore',
      item,
    })
  }

  function confirmRestore() {
    if (!dialog || dialog.type !== 'restore') return

    const item = dialog.item
    const duplicate = activeItems.find(
      (entry) =>
        normalizeText(entry.name) === normalizeText(item.name) &&
        normalizeText(entry.category) === normalizeText(item.category),
    )

    if (duplicate) {
      setDialog(null)

      showError(
        `Cannot restore "${item.name}" because an active item with the same name and category already exists.`,
      )

      return
    }

    const now = new Date().toISOString()

    setItems((current) =>
      current.map((entry) =>
        entry.id === item.id
          ? {
              ...entry,
              archivedAt: undefined,
              updatedAt: now,
            }
          : entry,
      ),
    )

    setDialog(null)

    showSuccess(`"${item.name}" was restored.`)
  }

  function openStockModal(
    item: InventoryItem,
    type: 'add' | 'use' | 'adjust',
  ) {
    if (item.archivedAt) {
      showError('Archived inventory items cannot be changed.')
      return
    }

    if (type === 'use' && getExpiryStatus(item) === 'expired') {
      showError(
        `"${item.name}" has expired and cannot be issued from inventory.`,
      )
      return
    }

    setStockItem(item)
    setStockType(type)
    setStockForm(emptyStockForm)
    setShowStockModal(true)
  }

  function closeStockModal() {
    setShowStockModal(false)
    setStockItem(null)
    setStockForm(emptyStockForm)
  }

  function handleStockUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!stockItem) return

    if (stockItem.archivedAt) {
      showError('This item is archived and cannot be changed.')
      closeStockModal()
      return
    }

    const quantity = roundQuantity(numberValue(stockForm.quantity))

    if (!Number.isFinite(quantity) || quantity <= 0) {
      showError('Enter a quantity greater than zero.')
      return
    }

    if (quantity > 100000000) {
      showError('The entered quantity is too large.')
      return
    }

    if (stockType === 'use') {
      if (getExpiryStatus(stockItem) === 'expired') {
        showError(
          `"${stockItem.name}" has expired and cannot be issued.`,
        )
        return
      }

      if (quantity > stockItem.quantity) {
        showError(
          `Only ${formatQuantity(stockItem.quantity)} ${stockItem.unit} are available.`,
        )
        return
      }
    }

    let newQuantity = stockItem.quantity

    if (stockType === 'add') {
      newQuantity = roundQuantity(stockItem.quantity + quantity)
    }

    if (stockType === 'use') {
      newQuantity = roundQuantity(stockItem.quantity - quantity)
    }

    if (stockType === 'adjust') {
      /*
       * For adjustment, the entered quantity represents
       * the NEW physical quantity, not the amount to add.
       */
      newQuantity = quantity
    }

    if (newQuantity < 0) {
      showError('Stock quantity cannot become negative.')
      return
    }

    if (
      stockType === 'adjust' &&
      newQuantity === stockItem.quantity
    ) {
      showError('The adjusted quantity is the same as the current quantity.')
      return
    }

    if (
      (stockType === 'use' || stockType === 'adjust') &&
      !stockForm.note.trim()
    ) {
      showError('Please enter a reason for this stock change.')
      return
    }

    const now = new Date().toISOString()

    const actionType: StockActionType =
      stockType === 'add'
        ? 'Stock added'
        : stockType === 'use'
          ? 'Stock used'
          : 'Stock adjusted'

    const action: StockAction = {
      id: crypto.randomUUID(),
      itemId: stockItem.id,
      type: actionType,
      quantity:
        stockType === 'adjust'
          ? Math.abs(roundQuantity(newQuantity - stockItem.quantity))
          : quantity,
      previousQuantity: stockItem.quantity,
      newQuantity,
      date: now,
      note: stockForm.note.trim(),
      reference: stockForm.reference.trim(),
    }

    setItems((current) =>
      current.map((item) =>
        item.id === stockItem.id
          ? {
              ...item,
              quantity: newQuantity,
              updatedAt: now,
            }
          : item,
      ),
    )

    setHistory((current) => [action, ...current])

    closeStockModal()

    const actionMessage =
      stockType === 'add'
        ? 'Stock added successfully.'
        : stockType === 'use'
          ? 'Stock usage recorded.'
          : 'Stock adjustment recorded.'

    showSuccess(actionMessage)
  }

  return (
    <div className="space-y-6">
      {storageError && (
        <div
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800"
        >
          <div className="font-semibold">
            Local storage problem detected
          </div>

          <p className="mt-1">
            The browser could not safely save inventory changes. Do not rely
            on this local version for real clinic records until the database
            version is implemented.
          </p>
        </div>
      )}

      {notice && (
        <div
          role="status"
          className={`flex items-start justify-between gap-4 rounded-2xl border px-5 py-4 text-sm ${
            notice.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-red-200 bg-red-50 text-red-800'
          }`}
        >
          <div className="flex items-start gap-3">
            {notice.type === 'success' ? (
              <CheckCircle2 size={19} className="mt-0.5 shrink-0" />
            ) : (
              <AlertTriangle size={19} className="mt-0.5 shrink-0" />
            )}

            <span>{notice.message}</span>
          </div>

          <button
            type="button"
            onClick={() => setNotice(null)}
            className="shrink-0 rounded-lg p-1 hover:bg-black/5"
            aria-label="Dismiss notification"
          >
            <X size={17} />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-clinic-teal">
            Clinic inventory
          </p>

          <h1 className="font-display text-3xl font-semibold text-clinic-ink">
            Inventory
          </h1>

          <p className="mt-1 text-sm text-clinic-ink/55">
            Track dental materials, stock movements, suppliers and expiry
            dates.
          </p>
        </div>

        <button
          type="button"
          onClick={openAddItem}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-clinic-teal px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
        >
          <Plus size={18} />
          Add item
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard
          icon={<Package size={20} />}
          label="Active items"
          value={totalItems}
          description="Inventory items"
        />

        <SummaryCard
          icon={<AlertTriangle size={20} />}
          label="Low stock"
          value={lowStockCount}
          description="At or below minimum"
        />

        <SummaryCard
          icon={<AlertTriangle size={20} />}
          label="Out of stock"
          value={outOfStockCount}
          description="Need replenishment"
        />

        <SummaryCard
          icon={<AlertTriangle size={20} />}
          label="Expiring soon"
          value={expiringSoonCount}
          description={`Within ${EXPIRING_SOON_DAYS} days`}
        />

        <SummaryCard
          icon={<Package size={20} />}
          label="Stock value"
          value={formatCurrencyFromPaise(totalStockValuePaise)}
          description="Current purchase value"
        />
      </div>

      {/* Search and filters */}
      <div className="rounded-2xl border border-clinic-line bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 xl:flex-row">
          <div className="relative flex-1">
            <Search
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-clinic-ink/35"
            />

            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search item, category or supplier..."
              className="input-field pl-10"
              aria-label="Search inventory"
            />
          </div>

          <select
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
            className="input-field xl:w-56"
            aria-label="Filter by category"
          >
            {categories.map((category) => (
              <option key={category}>{category}</option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="input-field xl:w-40"
            aria-label="Filter inventory status"
          >
            <option value="Active">Active</option>
            <option value="Archived">Archived</option>
            <option value="All">All</option>
          </select>

          <button
            type="button"
            onClick={() => setShowHistory(true)}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-clinic-line px-4 py-3 text-sm font-semibold text-clinic-ink/70 hover:bg-clinic-paper"
          >
            <History size={17} />
            Stock history
          </button>
        </div>
      </div>

      {/* Important alerts */}
      {(expiredCount > 0 || expiringSoonCount > 0) && (
        <div className="grid gap-3 md:grid-cols-2">
          {expiredCount > 0 && (
            <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4">
              <AlertTriangle className="mt-0.5 shrink-0 text-red-700" size={20} />

              <div>
                <div className="font-semibold text-red-800">
                  {expiredCount} expired item
                  {expiredCount === 1 ? '' : 's'}
                </div>

                <p className="mt-1 text-sm text-red-700">
                  Expired materials are blocked from stock usage.
                </p>
              </div>
            </div>
          )}

          {expiringSoonCount > 0 && (
            <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <AlertTriangle
                className="mt-0.5 shrink-0 text-amber-700"
                size={20}
              />

              <div>
                <div className="font-semibold text-amber-800">
                  {expiringSoonCount} item
                  {expiringSoonCount === 1 ? '' : 's'} expiring soon
                </div>

                <p className="mt-1 text-sm text-amber-700">
                  Review expiry dates before using these materials.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Inventory table */}
      <div className="overflow-hidden rounded-2xl border border-clinic-line bg-white shadow-sm">
        {filteredItems.length === 0 ? (
          <EmptyState
            archived={statusFilter === 'Archived'}
            hasFilters={
              Boolean(search.trim()) ||
              categoryFilter !== 'All' ||
              statusFilter !== 'Active'
            }
            onAdd={openAddItem}
            onClear={() => {
              setSearch('')
              setCategoryFilter('All')
              setStatusFilter('Active')
            }}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[1250px] w-full text-left text-sm">
              <thead className="border-b border-clinic-line bg-clinic-paper">
                <tr>
                  <th className="px-5 py-4 font-semibold">Item</th>
                  <th className="px-5 py-4 font-semibold">Category</th>
                  <th className="px-5 py-4 font-semibold">Stock</th>
                  <th className="px-5 py-4 font-semibold">Min. stock</th>
                  <th className="px-5 py-4 font-semibold">Purchase price</th>
                  <th className="px-5 py-4 font-semibold">Expiry</th>
                  <th className="px-5 py-4 font-semibold">Supplier</th>
                  <th className="px-5 py-4 font-semibold">Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredItems.map((item) => {
                  const lowStock =
                    !item.archivedAt && isLowStock(item)

                  const expiryStatus = getExpiryStatus(item)
                  const daysUntilExpiry = getDaysUntilExpiry(item)

                  return (
                    <tr
                      key={item.id}
                      className={`border-b border-clinic-line last:border-b-0 ${
                        item.archivedAt ? 'bg-gray-50 opacity-70' : ''
                      }`}
                    >
                      <td className="px-5 py-4">
                        <div className="font-semibold text-clinic-ink">
                          {item.name}
                        </div>

                        <div className="mt-1 text-xs text-clinic-ink/40">
                          Created {formatDate(item.createdAt.slice(0, 10))}
                        </div>
                      </td>

                      <td className="px-5 py-4 text-clinic-ink/65">
                        {item.category}
                      </td>

                      <td className="px-5 py-4">
                        <div className="font-semibold">
                          {formatQuantity(item.quantity)} {item.unit}
                        </div>

                        {!item.archivedAt && (
                          <StatusBadge
                            status={
                              item.quantity === 0
                                ? 'Out of stock'
                                : lowStock
                                  ? 'Low stock'
                                  : 'In stock'
                            }
                          />
                        )}

                        {item.archivedAt && (
                          <StatusBadge status="Archived" />
                        )}
                      </td>

                      <td className="px-5 py-4 text-clinic-ink/65">
                        {formatQuantity(item.minimumStock)} {item.unit}
                      </td>

                      <td className="px-5 py-4 font-medium">
                        {formatCurrencyFromPaise(
                          item.purchasePricePaise,
                        )}
                      </td>

                      <td className="px-5 py-4">
                        {expiryStatus === 'expired' ? (
                          <div>
                            <div className="font-semibold text-red-700">
                              {formatDate(item.expiryDate)}
                            </div>

                            <div className="mt-1 text-xs text-red-600">
                              Expired
                            </div>
                          </div>
                        ) : expiryStatus === 'soon' ? (
                          <div>
                            <div className="font-semibold text-amber-700">
                              {formatDate(item.expiryDate)}
                            </div>

                            <div className="mt-1 text-xs text-amber-600">
                              {daysUntilExpiry === 0
                                ? 'Expires today'
                                : `Expires in ${daysUntilExpiry} days`}
                            </div>
                          </div>
                        ) : (
                          formatDate(item.expiryDate)
                        )}
                      </td>

                      <td className="px-5 py-4 text-clinic-ink/65">
                        {item.supplier || '—'}
                      </td>

                      <td className="px-5 py-4">
                        <div className="flex flex-wrap gap-2">
                          {!item.archivedAt && (
                            <>
                              <button
                                type="button"
                                onClick={() =>
                                  openStockModal(item, 'add')
                                }
                                className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                              >
                                + Add stock
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  openStockModal(item, 'use')
                                }
                                disabled={expiryStatus === 'expired'}
                                className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-40"
                                title={
                                  expiryStatus === 'expired'
                                    ? 'Expired stock cannot be used'
                                    : 'Record stock usage'
                                }
                              >
                                − Use stock
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  openStockModal(item, 'adjust')
                                }
                                className="rounded-lg border border-clinic-line px-3 py-2 text-xs font-semibold text-clinic-ink/70 hover:bg-clinic-paper"
                              >
                                Adjust
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  openEditItem(item)
                                }
                                className="inline-flex items-center gap-1.5 rounded-lg border border-clinic-line px-3 py-2 text-xs font-semibold text-clinic-ink/70 hover:bg-clinic-paper"
                              >
                                <Pencil size={14} />
                                Edit
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  requestDelete(item)
                                }
                                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"
                              >
                                <Archive size={14} />
                                Archive
                              </button>
                            </>
                          )}

                          {item.archivedAt && (
                            <button
                              type="button"
                              onClick={() =>
                                requestRestore(item)
                              }
                              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                            >
                              <RotateCcw size={14} />
                              Restore
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit modal */}
      {showForm && (
        <Modal
          title={
            editingItem
              ? 'Edit inventory item'
              : 'Add inventory item'
          }
          description={
            editingItem
              ? 'Update item information. Stock quantity is managed separately through stock transactions.'
              : 'Enter the item details and opening stock.'
          }
          onClose={closeForm}
          maxWidth="max-w-2xl"
        >
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Item name" required>
                <input
                  type="text"
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder="e.g. Composite Resin"
                  className="input-field"
                  maxLength={100}
                  required
                  autoFocus
                />
              </Field>

              <Field label="Category" required>
                <input
                  type="text"
                  list="inventory-categories"
                  value={form.category}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      category: event.target.value,
                    }))
                  }
                  placeholder="e.g. Filling Materials"
                  className="input-field"
                  maxLength={80}
                  required
                />

                <datalist id="inventory-categories">
                  {categories
                    .filter((category) => category !== 'All')
                    .map((category) => (
                      <option key={category} value={category} />
                    ))}
                </datalist>
              </Field>

              <Field
                label={
                  editingItem
                    ? 'Current stock'
                    : 'Opening stock'
                }
              >
                <input
                  type="text"
                  inputMode="decimal"
                  value={form.quantity}
                  disabled={Boolean(editingItem)}
                  onFocus={(event) =>
                    event.currentTarget.select()
                  }
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      quantity: sanitizeQuantityInput(
                        event.target.value,
                      ),
                    }))
                  }
                  className="input-field disabled:cursor-not-allowed disabled:bg-gray-100"
                />

                {editingItem && (
                  <p className="mt-1.5 text-xs text-clinic-ink/45">
                    Use “Add stock”, “Use stock” or “Adjust” to change
                    quantity.
                  </p>
                )}
              </Field>

              <Field label="Unit">
                <select
                  value={form.unit}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      unit: event.target.value,
                    }))
                  }
                  className="input-field"
                >
                  {UNITS.map((unit) => (
                    <option key={unit} value={unit}>
                      {unit.charAt(0).toUpperCase() + unit.slice(1)}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Minimum stock">
                <input
                  type="text"
                  inputMode="decimal"
                  value={form.minimumStock}
                  onFocus={(event) =>
                    event.currentTarget.select()
                  }
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      minimumStock: sanitizeQuantityInput(
                        event.target.value,
                      ),
                    }))
                  }
                  className="input-field"
                />
              </Field>

              <Field label="Purchase price (₹)">
                <input
                  type="text"
                  inputMode="decimal"
                  value={form.purchasePrice}
                  onFocus={(event) =>
                    event.currentTarget.select()
                  }
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      purchasePrice: sanitizePriceInput(
                        event.target.value,
                      ),
                    }))
                  }
                  placeholder="0.00"
                  className="input-field"
                />

                <p className="mt-1.5 text-xs text-clinic-ink/45">
                  Up to 2 decimal places.
                </p>
              </Field>

              <Field label="Supplier">
                <input
                  type="text"
                  value={form.supplier}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      supplier: event.target.value,
                    }))
                  }
                  placeholder="Supplier name"
                  className="input-field"
                  maxLength={120}
                />
              </Field>

              <Field label="Expiry date">
                <input
                  type="date"
                  value={form.expiryDate}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      expiryDate: event.target.value,
                    }))
                  }
                  className="input-field"
                />
              </Field>
            </div>

            <div className="rounded-xl border border-clinic-line bg-clinic-paper p-4 text-sm text-clinic-ink/60">
              <strong className="text-clinic-ink">
                Stock control:
              </strong>{' '}
              quantity changes are recorded separately so we can maintain a
              reliable stock history.
            </div>

            <ModalActions
              onCancel={closeForm}
              submitLabel={editingItem ? 'Save changes' : 'Add item'}
            />
          </form>
        </Modal>
      )}

      {/* Stock modal */}
      {showStockModal && stockItem && (
        <Modal
          title={
            stockType === 'add'
              ? 'Add stock'
              : stockType === 'use'
                ? 'Use stock'
                : 'Adjust stock'
          }
          description={
            stockType === 'adjust'
              ? 'Set the physical quantity currently present. A reason is required.'
              : stockType === 'add'
                ? 'Record a stock receipt or replenishment.'
                : 'Record material used by the clinic.'
          }
          onClose={closeStockModal}
          maxWidth="max-w-md"
        >
          <form
            onSubmit={handleStockUpdate}
            className="space-y-5"
          >
            <div className="rounded-xl bg-clinic-paper p-4">
              <div className="font-semibold text-clinic-ink">
                {stockItem.name}
              </div>

              <div className="mt-1 text-sm text-clinic-ink/55">
                Current stock:{' '}
                <strong>
                  {formatQuantity(stockItem.quantity)}{' '}
                  {stockItem.unit}
                </strong>
              </div>

              {getExpiryStatus(stockItem) === 'expired' && (
                <div className="mt-3 rounded-lg bg-red-50 p-3 text-xs font-medium text-red-700">
                  This item has expired. Stock usage is blocked.
                </div>
              )}
            </div>

            <Field
              label={
                stockType === 'adjust'
                  ? `New physical quantity (${stockItem.unit})`
                  : `Quantity (${stockItem.unit})`
              }
              required
            >
              <input
                type="text"
                inputMode="decimal"
                value={stockForm.quantity}
                onFocus={(event) =>
                  event.currentTarget.select()
                }
                onChange={(event) =>
                  setStockForm((current) => ({
                    ...current,
                    quantity: sanitizeQuantityInput(
                      event.target.value,
                    ),
                  }))
                }
                className="input-field"
                required
                autoFocus
              />
            </Field>

            <Field
              label={
                stockType === 'add'
                  ? 'Note'
                  : 'Reason'
              }
              required={stockType !== 'add'}
            >
              <textarea
                value={stockForm.note}
                onChange={(event) =>
                  setStockForm((current) => ({
                    ...current,
                    note: event.target.value,
                  }))
                }
                placeholder={
                  stockType === 'add'
                    ? 'e.g. New supplier delivery'
                    : stockType === 'use'
                      ? 'e.g. Used for patient treatment'
                      : 'e.g. Physical stock count correction'
                }
                rows={3}
                className="input-field resize-none"
                maxLength={500}
                required={stockType !== 'add'}
              />
            </Field>

            <Field label="Reference">
              <input
                type="text"
                value={stockForm.reference}
                onChange={(event) =>
                  setStockForm((current) => ({
                    ...current,
                    reference: event.target.value,
                  }))
                }
                placeholder="e.g. Supplier invoice / stock count"
                className="input-field"
                maxLength={100}
              />
            </Field>

            {stockType === 'adjust' && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                <strong>Important:</strong> adjustment is for correcting the
                physical stock count. Use it only when the actual quantity
                differs from the recorded quantity.
              </div>
            )}

            <ModalActions
              onCancel={closeStockModal}
              submitLabel={
                stockType === 'add'
                  ? 'Add stock'
                  : stockType === 'use'
                    ? 'Record usage'
                    : 'Save adjustment'
              }
            />
          </form>
        </Modal>
      )}

      {/* History modal */}
      {showHistory && (
        <Modal
          title="Stock history"
          description="Complete stock movement history is retained even when an item is archived."
          onClose={() => setShowHistory(false)}
          maxWidth="max-w-4xl"
        >
          {history.length === 0 ? (
            <div className="py-10 text-center text-sm text-clinic-ink/50">
              No stock transactions have been recorded yet.
            </div>
          ) : (
            <div className="max-h-[65vh] overflow-auto">
              <div className="overflow-x-auto">
                <table className="min-w-[900px] w-full text-left text-sm">
                  <thead className="sticky top-0 border-b border-clinic-line bg-clinic-paper">
                    <tr>
                      <th className="px-4 py-3 font-semibold">
                        Date
                      </th>
                      <th className="px-4 py-3 font-semibold">
                        Item
                      </th>
                      <th className="px-4 py-3 font-semibold">
                        Action
                      </th>
                      <th className="px-4 py-3 font-semibold">
                        Change
                      </th>
                      <th className="px-4 py-3 font-semibold">
                        Stock
                      </th>
                      <th className="px-4 py-3 font-semibold">
                        Reason / note
                      </th>
                      <th className="px-4 py-3 font-semibold">
                        Reference
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {history.map((entry) => {
                      const item = items.find(
                        (inventoryItem) =>
                          inventoryItem.id === entry.itemId,
                      )

                      const difference =
                        entry.newQuantity -
                        entry.previousQuantity

                      return (
                        <tr
                          key={entry.id}
                          className="border-b border-clinic-line last:border-b-0"
                        >
                          <td className="px-4 py-3 text-xs text-clinic-ink/55">
                            {formatDateTime(entry.date)}
                          </td>

                          <td className="px-4 py-3 font-medium">
                            {item?.name || 'Archived item'}
                          </td>

                          <td className="px-4 py-3">
                            <HistoryBadge type={entry.type} />
                          </td>

                          <td
                            className={`px-4 py-3 font-semibold ${
                              difference > 0
                                ? 'text-emerald-700'
                                : difference < 0
                                  ? 'text-red-700'
                                  : 'text-clinic-ink/60'
                            }`}
                          >
                            {difference > 0 ? '+' : ''}
                            {formatQuantity(difference)}
                            {item ? ` ${item.unit}` : ''}
                          </td>

                          <td className="px-4 py-3 text-clinic-ink/65">
                            {formatQuantity(
                              entry.previousQuantity,
                            )}{' '}
                            →{' '}
                            {formatQuantity(entry.newQuantity)}
                          </td>

                          <td className="max-w-xs px-4 py-3 text-clinic-ink/60">
                            {entry.note || '—'}
                          </td>

                          <td className="px-4 py-3 text-clinic-ink/60">
                            {entry.reference || '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* Delete / restore confirmation */}
      {dialog && (
        <Modal
          title={
            dialog.type === 'delete'
              ? 'Archive inventory item?'
              : 'Restore inventory item?'
          }
          description={
            dialog.type === 'delete'
              ? 'The item will disappear from active inventory, but its complete stock history will be preserved.'
              : 'The item will become active again and available for inventory management.'
          }
          onClose={() => setDialog(null)}
          maxWidth="max-w-md"
        >
          <div className="rounded-xl bg-clinic-paper p-4">
            <div className="font-semibold text-clinic-ink">
              {dialog.item.name}
            </div>

            <div className="mt-1 text-sm text-clinic-ink/55">
              {dialog.item.category} ·{' '}
              {formatQuantity(dialog.item.quantity)}{' '}
              {dialog.item.unit}
            </div>
          </div>

          <div className="mt-5 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setDialog(null)}
              className="rounded-xl border border-clinic-line px-5 py-2.5 text-sm font-semibold"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={
                dialog.type === 'delete'
                  ? confirmDelete
                  : confirmRestore
              }
              className={`rounded-xl px-5 py-2.5 text-sm font-semibold text-white ${
                dialog.type === 'delete'
                  ? 'bg-red-700 hover:bg-red-800'
                  : 'bg-clinic-teal hover:opacity-90'
              }`}
            >
              {dialog.type === 'delete'
                ? 'Archive item'
                : 'Restore item'}
            </button>
          </div>
        </Modal>
      )}

      {/* Keep an explicit reference to the icon so tree-shaking does not
          depend on conditional rendering paths. */}
      <span className="hidden">
        <Trash2 size={1} />
      </span>
    </div>
  )
}

function SummaryCard({
  icon,
  label,
  value,
  description,
}: {
  icon: ReactNode
  label: string
  value: string | number
  description: string
}) {
  return (
    <div className="rounded-2xl border border-clinic-line bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="rounded-xl bg-clinic-paper p-2.5 text-clinic-teal">
          {icon}
        </div>
      </div>

      <div className="mt-5">
        <div className="text-sm text-clinic-ink/50">
          {label}
        </div>

        <div className="mt-1 text-2xl font-bold text-clinic-ink">
          {value}
        </div>

        <div className="mt-1 text-xs text-clinic-ink/40">
          {description}
        </div>
      </div>
    </div>
  )
}

function StatusBadge({
  status,
}: {
  status:
    | 'In stock'
    | 'Low stock'
    | 'Out of stock'
    | 'Archived'
}) {
  const classes = {
    'In stock': 'bg-emerald-50 text-emerald-700',
    'Low stock': 'bg-amber-50 text-amber-700',
    'Out of stock': 'bg-red-50 text-red-700',
    Archived: 'bg-gray-100 text-gray-600',
  }

  return (
    <span
      className={`mt-1 inline-flex rounded-full px-2 py-1 text-xs font-medium ${classes[status]}`}
    >
      {status}
    </span>
  )
}

function HistoryBadge({
  type,
}: {
  type: StockActionType
}) {
  const classes = {
    'Opening stock': 'bg-blue-50 text-blue-700',
    'Stock added': 'bg-emerald-50 text-emerald-700',
    'Stock used': 'bg-amber-50 text-amber-700',
    'Stock adjusted': 'bg-purple-50 text-purple-700',
  }

  return (
    <span
      className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${classes[type]}`}
    >
      {type}
    </span>
  )
}

function EmptyState({
  archived,
  hasFilters,
  onAdd,
  onClear,
}: {
  archived: boolean
  hasFilters: boolean
  onAdd: () => void
  onClear: () => void
}) {
  return (
    <div className="px-6 py-16 text-center">
      <Package
        size={44}
        className="mx-auto text-clinic-ink/20"
      />

      <h2 className="mt-4 font-display text-xl font-semibold text-clinic-ink">
        {archived
          ? 'No archived items'
          : hasFilters
            ? 'No matching inventory items'
            : 'No inventory items yet'}
      </h2>

      <p className="mx-auto mt-2 max-w-md text-sm text-clinic-ink/50">
        {archived
          ? 'Archived items will appear here and can be restored later.'
          : hasFilters
            ? 'Try changing the search or filters.'
            : 'Add your first inventory item to start tracking clinic stock.'}
      </p>

      {hasFilters ? (
        <button
          type="button"
          onClick={onClear}
          className="mt-5 rounded-xl border border-clinic-line px-5 py-2.5 text-sm font-semibold text-clinic-ink/70 hover:bg-clinic-paper"
        >
          Clear filters
        </button>
      ) : (
        <button
          type="button"
          onClick={onAdd}
          className="mt-5 rounded-xl bg-clinic-teal px-5 py-2.5 text-sm font-semibold text-white"
        >
          Add first item
        </button>
      )}
    </div>
  )
}

function Modal({
  title,
  description,
  onClose,
  children,
  maxWidth,
}: {
  title: string
  description?: string
  onClose: () => void
  children: ReactNode
  maxWidth: string
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <div
        className={`w-full ${maxWidth} max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-xl`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-clinic-line px-6 py-5">
          <div>
            <h2 className="font-display text-2xl font-semibold text-clinic-ink">
              {title}
            </h2>

            {description && (
              <p className="mt-1.5 text-sm text-clinic-ink/50">
                {description}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-2 text-clinic-ink/50 hover:bg-clinic-paper"
            aria-label="Close dialog"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

function ModalActions({
  onCancel,
  submitLabel,
}: {
  onCancel: () => void
  submitLabel: string
}) {
  return (
    <div className="flex justify-end gap-3 border-t border-clinic-line pt-5">
      <button
        type="button"
        onClick={onCancel}
        className="rounded-xl border border-clinic-line px-5 py-2.5 text-sm font-semibold text-clinic-ink/75 hover:bg-clinic-paper"
      >
        Cancel
      </button>

      <button
        type="submit"
        className="rounded-xl bg-clinic-teal px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90"
      >
        {submitLabel}
      </button>
    </div>
  )
}

function Field({
  label,
  required = false,
  children,
}: {
  label: string
  required?: boolean
  children: ReactNode
}) {
  return (
    <label className="block">
      <div className="mb-2 text-sm font-medium text-clinic-ink/75">
        {label}
        {required && (
          <span className="ml-1 text-red-500">*</span>
        )}
      </div>

      {children}
    </label>
  )
}