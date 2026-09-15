import { useEffect, useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { getWhatsAppUrl } from '../../lib/whatsapp'

type Patient = {
  id: string
  patientNumber?: string
  name: string
  phone?: string
}

type Appointment = {
  id: string
  patientId: string
  patientName: string
  date: string
  time: string
  reason: string
  status: 'Scheduled' | 'Under treatment' | 'Completed' | 'Cancelled' | 'No show'
  notes?: string
  disease?: string
  requiredVisits?: string
  plannedTreatments?: string
  actionReason?: string
  treatmentDetails?: string
  revisitDate?: string
  rescheduleDate?: string
  rescheduleTime?: string
}

type TreatmentStatus =
  | 'Planned'
  | 'In progress'
  | 'Partially completed'
  | 'Completed'
  | 'On hold'
  | 'Cancelled'

type TreatmentProgressHistory = {
  id: string
  changedAt: string
  previousStatus: TreatmentStatus
  newStatus: TreatmentStatus
  previousCompletedVisits: number
  completedVisits: number
  previousPlannedVisits: number
  plannedVisits: number
  previousNextVisit: string
  nextVisit: string
  note: string
}

type PaymentStatus = 'Unpaid' | 'Partially paid' | 'Paid'

type PaymentMethod = 'Cash' | 'UPI' | 'Card' | 'Bank transfer' | 'Other'

type InvoiceItem = {
  id: string
  treatmentId?: string
  description: string
  quantity: number
  amount: number
}

type Invoice = {
  id: string
  invoiceNumber: string
  patientId: string
  patientName: string
  date: string
  items: InvoiceItem[]
  discount: number
  total: number
  amountPaid: number
  paymentStatus: PaymentStatus
  paymentMethod?: PaymentMethod
  notes: string
}

type TreatmentWhatsAppHistory = {
  id: string
  kind: 'initial' | 'status'
  status?: TreatmentStatus
  sentAt: string
}

type AppointmentWhatsAppHistory = {
  initialSentAt?: string
}

type Treatment = {
  id: string
  patientId: string
  patientName: string
  treatmentName: string
  tooth: string
  diagnosis: string
  status: TreatmentStatus
  plannedVisits: number
  completedVisits: number
  cost: number
  startDate: string
  nextVisit: string
  notes: string
  createdAt: string
  progressHistory?: TreatmentProgressHistory[]
  whatsappHistory?: TreatmentWhatsAppHistory[]
  inventoryUsageApplied?: boolean
  inventoryUsageAppliedAt?: string
  inventoryWarnings?: string[]
}

type TreatmentCatalogueItem = {
  id: string
  name: string
  usageCount: number
  createdAt: string
  custom?: boolean
}

type InventoryItem = {
  id: string
  name: string
  category: string
  quantity: number
  unit: string
  minimumStock: number
  purchasePrice: number
  supplier: string
  expiryDate: string
  createdAt: string
}

type StockAction = {
  id: string
  itemId: string
  type: 'Stock added' | 'Stock used'
  quantity: number
  date: string
  note: string
}

type InventoryRequirement = {
  names: string[]
  quantity: number
  inventoryItemId?: string
}

type InventoryUsageRule = {
  id: string
  inventoryItemId: string
  itemName: string
  aliases: string[]
  quantity: number
}

const PATIENTS_STORAGE_KEY = 'joshi-dental-clinic-patients'
const TREATMENTS_STORAGE_KEY = 'joshi-dental-clinic-treatments'
const APPOINTMENTS_STORAGE_KEY = 'joshi-dental-clinic-appointments'
const CATALOGUE_STORAGE_KEY = 'joshi-dental-clinic-treatment-catalogue'
const INVENTORY_STORAGE_KEY = 'joshi-dental-clinic-inventory'
const INVENTORY_HISTORY_KEY = 'joshi-dental-clinic-inventory-history'
const INVENTORY_RULES_KEY = 'joshi-dental-clinic-inventory-rules'
const INVOICES_STORAGE_KEY = 'joshi-dental-clinic-invoices'

const MAX_TREATMENT_COST = 100000000
const MAX_PLANNED_VISITS = 50

const DEFAULT_TREATMENTS = [
  'Consultation / Dental examination',
  'Dental X-ray',
  'Scaling & polishing',
  'Fluoride application',
  'Dental filling — GIC',
  'Dental filling — Composite',
  'Temporary filling',
  'Root canal treatment',
  'Root canal retreatment',
  'Crown',
  'Bridge',
  'Veneer',
  'Tooth extraction',
  'Surgical extraction',
  'Wisdom tooth extraction',
  'Dental implant',
  'Denture',
  'Local anaesthesia',
  'Pulpotomy',
  'Pulpectomy',
  'Post & core',
  'Cementation',
  'Dental sealant',
  'Teeth bleaching',
  'Orthodontic adjustment',
  'Emergency pain management',
  'Dressing',
  'Suturing',
  'Follow-up / review',
]

/*
 * These are clinic defaults, not clinical instructions.
 * The inventory names are aliases so the system can match
 * "K file", "K-file", etc. against the clinic's inventory.
 *
 * Quantities should be reviewed and changed for the clinic
 * before real-world use.
 */
const DEFAULT_INVENTORY_RULES: Record<string, InventoryRequirement[]> = {
  'Dental filling — GIC': [
    { names: ['GIC cement', 'glass ionomer cement'], quantity: 1 },
    { names: ['cotton roll', 'cotton rolls'], quantity: 2 },
    { names: ['gloves', 'disposable gloves'], quantity: 2 },
  ],
  'Dental filling — Composite': [
    { names: ['composite resin', 'composite'], quantity: 1 },
    { names: ['etchant', 'etching gel'], quantity: 1 },
    { names: ['bonding agent', 'bond'], quantity: 1 },
    { names: ['cotton roll', 'cotton rolls'], quantity: 2 },
    { names: ['gloves', 'disposable gloves'], quantity: 2 },
  ],
  'Root canal treatment': [
    { names: ['K file', 'K-file', 'K files', 'K-files'], quantity: 1 },
    { names: ['rotary file', 'rotary files'], quantity: 1 },
    { names: ['gutta-percha', 'gutta percha'], quantity: 2 },
    { names: ['endodontic sealer', 'sealer'], quantity: 1 },
    { names: ['irrigation solution', 'irrigant'], quantity: 1 },
    { names: ['dental needle', 'dental needles', 'needle'], quantity: 1 },
    { names: ['gloves', 'disposable gloves'], quantity: 2 },
  ],
  'Root canal retreatment': [
    { names: ['K file', 'K-file', 'K files', 'K-files'], quantity: 1 },
    { names: ['rotary file', 'rotary files'], quantity: 1 },
    { names: ['gutta-percha', 'gutta percha'], quantity: 2 },
    { names: ['endodontic sealer', 'sealer'], quantity: 1 },
    { names: ['irrigation solution', 'irrigant'], quantity: 1 },
    { names: ['dental needle', 'dental needles', 'needle'], quantity: 1 },
    { names: ['gloves', 'disposable gloves'], quantity: 2 },
  ],
  'Tooth extraction': [
    { names: ['dental needle', 'dental needles', 'needle'], quantity: 1 },
    { names: ['local anaesthetic', 'local anesthetic'], quantity: 1 },
    { names: ['gauze', 'gauze pieces'], quantity: 2 },
    { names: ['gloves', 'disposable gloves'], quantity: 2 },
  ],
  'Surgical extraction': [
    { names: ['dental needle', 'dental needles', 'needle'], quantity: 1 },
    { names: ['local anaesthetic', 'local anesthetic'], quantity: 2 },
    { names: ['gauze', 'gauze pieces'], quantity: 3 },
    { names: ['suture', 'sutures', 'suture material'], quantity: 1 },
    { names: ['gloves', 'disposable gloves'], quantity: 2 },
  ],
  'Wisdom tooth extraction': [
    { names: ['dental needle', 'dental needles', 'needle'], quantity: 2 },
    { names: ['local anaesthetic', 'local anesthetic'], quantity: 2 },
    { names: ['gauze', 'gauze pieces'], quantity: 3 },
    { names: ['suture', 'sutures', 'suture material'], quantity: 1 },
    { names: ['gloves', 'disposable gloves'], quantity: 2 },
  ],
  'Scaling & polishing': [
    { names: ['prophy paste', 'prophylaxis paste'], quantity: 1 },
    { names: ['cotton roll', 'cotton rolls'], quantity: 2 },
    { names: ['gloves', 'disposable gloves'], quantity: 2 },
  ],
  'Dental sealant': [
    { names: ['sealant', 'dental sealant'], quantity: 1 },
    { names: ['etchant', 'etching gel'], quantity: 1 },
    { names: ['bonding agent', 'bond'], quantity: 1 },
    { names: ['cotton roll', 'cotton rolls'], quantity: 2 },
    { names: ['gloves', 'disposable gloves'], quantity: 2 },
  ],
  'Denture': [
    { names: ['alginate', 'alginate impression material'], quantity: 1 },
    { names: ['impression material'], quantity: 1 },
    { names: ['gloves', 'disposable gloves'], quantity: 2 },
  ],
}

type TreatmentForm = {
  patientId: string
  treatmentName: string
  tooth: string
  diagnosis: string
  status: TreatmentStatus
  plannedVisits: number
  completedVisits: number
  cost: number | string
  startDate: string
  nextVisit: string
  notes: string
}

const emptyForm = {
  patientId: '',
  treatmentName: '',
  tooth: '',
  diagnosis: '',
  status: 'Planned' as TreatmentStatus,
  plannedVisits: 1,
  completedVisits: 0,
  cost: '',
  startDate: '',
  nextVisit: '',
  notes: '',
}

function getLocalDateString() {
  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
}

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function isValidDateString(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
}

const clinicSchedule = {
  slotIntervalMinutes: 30,
  morning: { start: 10 * 60, end: 15 * 60 },
  evening: { start: 17 * 60, end: 22 * 60 },
}

type TreatmentAppointmentSlot = {
  value: string
  label: string
  available: boolean
}

function getCurrentTimeMinutes() {
  const now = new Date()
  return now.getHours() * 60 + now.getMinutes()
}

function isSunday(date: string) {
  return new Date(`${date}T00:00:00`).getDay() === 0
}

function getTimeValue(minutes: number) {
  return `${Math.floor(minutes / 60).toString().padStart(2, '0')}:${(minutes % 60)
    .toString()
    .padStart(2, '0')}`
}

function formatScheduleTime(minutes: number) {
  const hour = Math.floor(minutes / 60)
  const minute = minutes % 60
  const displayHour = hour % 12 || 12
  const period = hour >= 12 ? 'PM' : 'AM'
  return `${displayHour}:${String(minute).padStart(2, '0')} ${period}`
}

function getScheduleSlots(start: number, end: number): TreatmentAppointmentSlot[] {
  const slots: TreatmentAppointmentSlot[] = []

  for (
    let minutes = start;
    minutes < end;
    minutes += clinicSchedule.slotIntervalMinutes
  ) {
    slots.push({
      value: getTimeValue(minutes),
      label: formatScheduleTime(minutes),
      available: true,
    })
  }

  return slots
}

function getTreatmentDaySlots(
  date: string,
  appointments: Appointment[],
): TreatmentAppointmentSlot[] {
  if (!date || date < getLocalDateString()) return []

  const occupiedTimes = new Set(
    appointments
      .filter(
        (appointment) =>
          appointment.date === date &&
          appointment.status !== 'Cancelled' &&
          appointment.status !== 'No show',
      )
      .map((appointment) => appointment.time),
  )

  // Rescheduled appointments reserve their new slot too.
  appointments.forEach((appointment) => {
    if (appointment.rescheduleDate !== date || !appointment.rescheduleTime) return
    occupiedTimes.add(appointment.rescheduleTime)
  })

  const isToday = date === getLocalDateString()
  const nowMinutes = isToday ? getCurrentTimeMinutes() : -1

  // Sunday is allowed for treatment follow-ups too. It is not treated as
  // "urgent care" here; it simply uses the appointment module's Sunday
  // all-day 30-minute slot model.
  const baseSlots = isSunday(date)
    ? getScheduleSlots(0, 24 * 60)
    : [
        ...getScheduleSlots(clinicSchedule.morning.start, clinicSchedule.morning.end),
        ...getScheduleSlots(clinicSchedule.evening.start, clinicSchedule.evening.end),
      ]

  return baseSlots.map((slot) => {
    const [hour, minute] = slot.value.split(':').map(Number)
    const isPastTime = isToday && hour * 60 + minute <= nowMinutes

    return {
      ...slot,
      available: !isPastTime && !occupiedTimes.has(slot.value),
    }
  })
}

function loadPatients(): Patient[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(PATIENTS_STORAGE_KEY) || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter((p): p is Patient =>
      !!p && typeof p === 'object' &&
      typeof (p as Record<string, unknown>).id === 'string' &&
      typeof (p as Record<string, unknown>).name === 'string'
    ).map((p) => ({
      id: p.id,
      patientNumber: typeof p.patientNumber === 'string' ? p.patientNumber : undefined,
      name: p.name,
      phone: typeof p.phone === 'string' ? p.phone : undefined,
    }))
  } catch {
    return []
  }
}

function loadAppointments(): Appointment[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(APPOINTMENTS_STORAGE_KEY) || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter((a): a is Appointment => {
      if (!a || typeof a !== 'object') return false
      const r = a as Record<string, unknown>
      return typeof r.id === 'string' &&
        typeof r.patientId === 'string' &&
        typeof r.patientName === 'string' &&
        typeof r.date === 'string' &&
        typeof r.time === 'string' &&
        typeof r.reason === 'string' &&
        ['Scheduled', 'Under treatment', 'Completed', 'Cancelled', 'No show'].includes(String(r.status))
    })
  } catch {
    return []
  }
}

function isTreatmentStatus(value: unknown): value is TreatmentStatus {
  return ['Planned', 'In progress', 'Partially completed', 'Completed', 'On hold', 'Cancelled'].includes(String(value))
}

function loadProgressHistory(value: unknown): TreatmentProgressHistory[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object')
    .map((entry) => ({
      id: typeof entry.id === 'string' ? entry.id : crypto.randomUUID(),
      changedAt: typeof entry.changedAt === 'string' ? entry.changedAt : new Date(0).toISOString(),
      previousStatus: isTreatmentStatus(entry.previousStatus) ? entry.previousStatus : 'Planned',
      newStatus: isTreatmentStatus(entry.newStatus) ? entry.newStatus : 'Planned',
      previousCompletedVisits: Number.isSafeInteger(entry.previousCompletedVisits) ? Number(entry.previousCompletedVisits) : 0,
      completedVisits: Number.isSafeInteger(entry.completedVisits) ? Number(entry.completedVisits) : 0,
      previousPlannedVisits: Number.isSafeInteger(entry.previousPlannedVisits) ? Number(entry.previousPlannedVisits) : 1,
      plannedVisits: Number.isSafeInteger(entry.plannedVisits) ? Number(entry.plannedVisits) : 1,
      previousNextVisit: typeof entry.previousNextVisit === 'string' ? entry.previousNextVisit : '',
      nextVisit: typeof entry.nextVisit === 'string' ? entry.nextVisit : '',
      note: typeof entry.note === 'string' ? entry.note : '',
    }))
}

function loadTreatments(): Treatment[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(TREATMENTS_STORAGE_KEY) || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter((r): r is Record<string, unknown> =>
      !!r && typeof r === 'object' &&
      typeof (r as Record<string, unknown>).id === 'string' &&
      typeof (r as Record<string, unknown>).patientId === 'string' &&
      typeof (r as Record<string, unknown>).treatmentName === 'string'
    ).map((r) => {
      const planned = Number.isSafeInteger(r.plannedVisits) && Number(r.plannedVisits) >= 1
        ? Math.min(Number(r.plannedVisits), MAX_PLANNED_VISITS) : 1
      const completed = Number.isSafeInteger(r.completedVisits) && Number(r.completedVisits) >= 0
        ? Math.min(Number(r.completedVisits), planned) : 0
      return {
        id: String(r.id),
        patientId: String(r.patientId),
        patientName: typeof r.patientName === 'string' ? r.patientName : '',
        treatmentName: String(r.treatmentName),
        tooth: typeof r.tooth === 'string' ? r.tooth : '',
        diagnosis: typeof r.diagnosis === 'string' ? r.diagnosis : '',
        status: isTreatmentStatus(r.status) ? r.status : 'Planned',
        plannedVisits: planned,
        completedVisits: completed,
        cost: Number.isFinite(Number(r.cost)) && Number(r.cost) >= 0 ? Number(r.cost) : 0,
        startDate: typeof r.startDate === 'string' && isValidDateString(r.startDate) ? r.startDate : '',
        nextVisit: typeof r.nextVisit === 'string' && isValidDateString(r.nextVisit) ? r.nextVisit : '',
        notes: typeof r.notes === 'string' ? r.notes : '',
        createdAt: typeof r.createdAt === 'string' ? r.createdAt : new Date(0).toISOString(),
        progressHistory: loadProgressHistory(r.progressHistory),
        inventoryUsageApplied: r.inventoryUsageApplied === true,
        inventoryUsageAppliedAt: typeof r.inventoryUsageAppliedAt === 'string' ? r.inventoryUsageAppliedAt : undefined,
        inventoryWarnings: Array.isArray(r.inventoryWarnings)
          ? r.inventoryWarnings.filter((v): v is string => typeof v === 'string')
          : [],
      }
    })
  } catch {
    return []
  }
}

function loadCatalogue(treatments: Treatment[]): TreatmentCatalogueItem[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(CATALOGUE_STORAGE_KEY) || '[]')
    const stored = Array.isArray(parsed) ? parsed : []
    const map = new Map<string, TreatmentCatalogueItem>()

    DEFAULT_TREATMENTS.forEach((name, index) => {
      map.set(normalizeName(name), {
        id: `default-${index}`,
        name,
        usageCount: 0,
        createdAt: new Date(0).toISOString(),
      })
    })

    stored.forEach((item) => {
      if (!item || typeof item !== 'object') return
      const r = item as Record<string, unknown>
      if (typeof r.name !== 'string' || !r.name.trim()) return
      map.set(normalizeName(r.name), {
        id: typeof r.id === 'string' ? r.id : crypto.randomUUID(),
        name: r.name.trim(),
        usageCount: Number.isFinite(Number(r.usageCount)) ? Number(r.usageCount) : 0,
        createdAt: typeof r.createdAt === 'string' ? r.createdAt : new Date().toISOString(),
        custom: r.custom === true,
      })
    })

    // Frequency is derived from actual treatment records, not the stored counter.
    // Cancelled records do not count as treatments that were actually done/started.
    treatments.forEach((treatment) => {
      if (treatment.status === 'Cancelled') return
      const key = normalizeName(treatment.treatmentName)
      const existing = map.get(key)
      if (existing) existing.usageCount += 1
      else map.set(key, {
        id: crypto.randomUUID(),
        name: treatment.treatmentName,
        usageCount: 1,
        createdAt: treatment.createdAt,
        custom: true,
      })
    })

    return [...map.values()].sort((a, b) =>
      b.usageCount - a.usageCount || a.name.localeCompare(b.name)
    )
  } catch {
    return DEFAULT_TREATMENTS.map((name, index) => ({
      id: `default-${index}`,
      name,
      usageCount: 0,
      createdAt: new Date(0).toISOString(),
    }))
  }
}

function loadInventory(): InventoryItem[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(INVENTORY_STORAGE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed as InventoryItem[] : []
  } catch {
    return []
  }
}

function loadInventoryHistory(): StockAction[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(INVENTORY_HISTORY_KEY) || '[]')
    return Array.isArray(parsed) ? parsed as StockAction[] : []
  } catch {
    return []
  }
}

function loadInvoices(): Invoice[] {
  try {
    const stored = localStorage.getItem(INVOICES_STORAGE_KEY)
    if (!stored) return []
    const parsed: unknown = JSON.parse(stored)
    if (!Array.isArray(parsed)) return []

    return parsed.filter((value): value is Invoice => {
      if (!value || typeof value !== 'object') return false
      const invoice = value as Partial<Invoice>
      if (typeof invoice.id !== 'string' || typeof invoice.patientId !== 'string') return false
      if (!Array.isArray(invoice.items)) return false
      if (!['Unpaid', 'Partially paid', 'Paid'].includes(String(invoice.paymentStatus))) return false
      return true
    })
  } catch {
    return []
  }
}

function formatCurrency(amount: number) {
  return `₹${Math.round(amount).toLocaleString('en-IN')}`
}

function formatDate(date: string) {
  if (!date) return '—'
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

function formatTime(time: string) {
  const [hour, minute] = time.split(':').map(Number)
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return time
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`
}

function highlightMatch(text: string, query: string): ReactNode {
  const trimmed = query.trim()
  if (!trimmed) return text

  const lowerText = text.toLowerCase()
  const lowerQuery = trimmed.toLowerCase()
  const parts: ReactNode[] = []
  let cursor = 0
  let matchIndex = lowerText.indexOf(lowerQuery, cursor)

  while (matchIndex !== -1) {
    if (matchIndex > cursor) parts.push(text.slice(cursor, matchIndex))
    parts.push(
      <mark key={`${matchIndex}-${trimmed}`} className="rounded bg-yellow-200 px-0.5 text-clinic-ink">
        {text.slice(matchIndex, matchIndex + trimmed.length)}
      </mark>,
    )
    cursor = matchIndex + trimmed.length
    matchIndex = lowerText.indexOf(lowerQuery, cursor)
  }

  if (cursor < text.length) parts.push(text.slice(cursor))
  return parts.length ? parts : text
}

function getStatusClasses(status: TreatmentStatus) {
  switch (status) {
    case 'Completed': return 'bg-clinic-success/10 text-clinic-success'
    case 'In progress': return 'bg-clinic-teal/10 text-clinic-teal'
    case 'Partially completed': return 'bg-blue-50 text-blue-700'
    case 'On hold': return 'bg-amber-50 text-amber-700'
    case 'Cancelled': return 'bg-red-50 text-red-700'
    default: return 'bg-clinic-paper text-clinic-ink/60'
  }
}

function getNextAppointment(appointments: Appointment[], patientId: string) {
  const today = getLocalDateString()
  return appointments
    .filter((a) =>
      a.patientId === patientId &&
      (a.status === 'Scheduled' || a.status === 'Under treatment') &&
      a.date >= today
    )
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))[0]
}

function findInventoryItem(
  items: InventoryItem[],
  aliases: string[],
  inventoryItemId?: string,
) {
  if (inventoryItemId) {
    const linked = items.find((item) => item.id === inventoryItemId)
    if (linked) return linked
  }

  const normalizedAliases = aliases.map(normalizeName)
  return items.find((item) => normalizedAliases.includes(normalizeName(item.name)))
}

function getInventoryRequirements(treatmentName: string): InventoryRequirement[] {
  try {
    const stored = localStorage.getItem(INVENTORY_RULES_KEY)
    if (stored) {
      const parsed: unknown = JSON.parse(stored)

      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const rulesMap = parsed as Record<string, unknown>
        const exactKey = Object.keys(rulesMap).find(
          (name) => normalizeName(name) === normalizeName(treatmentName),
        )
        const storedRules = exactKey ? rulesMap[exactKey] : undefined

        if (Array.isArray(storedRules)) {
          const rules = storedRules
            .filter((value): value is Record<string, unknown> => (
              Boolean(value) && typeof value === 'object'
            ))
            .map((value) => {
              const rule = value as Partial<InventoryUsageRule>
              if (
                typeof rule.inventoryItemId !== 'string' ||
                typeof rule.itemName !== 'string' ||
                !Array.isArray(rule.aliases) ||
                typeof rule.quantity !== 'number' ||
                !Number.isFinite(rule.quantity) ||
                rule.quantity <= 0
              ) {
                return null
              }

              return {
                names: [rule.itemName, ...rule.aliases.filter(
                  (alias): alias is string => typeof alias === 'string',
                )],
                inventoryItemId: rule.inventoryItemId,
                quantity: rule.quantity,
              }
            })
            .filter((rule): rule is NonNullable<typeof rule> => rule !== null)

          // A saved rule, including an intentionally empty rule, is authoritative.
          return rules
        }
      }
    }
  } catch {
    // Fall back to the built-in defaults if saved rules cannot be read.
  }

  const exact = Object.keys(DEFAULT_INVENTORY_RULES).find(
    (name) => normalizeName(name) === normalizeName(treatmentName),
  )

  return exact ? DEFAULT_INVENTORY_RULES[exact] : []
}

function applyInventoryForTreatment(
  treatment: Treatment,
  inventory: InventoryItem[],
  history: StockAction[],
) {
  const requirements = getInventoryRequirements(treatment.treatmentName)
  const nextInventory = inventory.map((item) => ({ ...item }))
  const nextHistory = [...history]
  const warnings: string[] = []

  if (requirements.length === 0) {
    warnings.push(`No inventory rule is configured for "${treatment.treatmentName}".`)
    return { inventory: nextInventory, history: nextHistory, warnings }
  }

  requirements.forEach((requirement) => {
    const item = findInventoryItem(nextInventory, requirement.names, requirement.inventoryItemId)

    if (!item) {
      warnings.push(`Inventory item not found: ${requirement.names[0]}.`)
      return
    }

    const available = Number(item.quantity) || 0
    const used = Math.min(Math.max(available, 0), requirement.quantity)

    if (used > 0) {
      item.quantity = Math.max(0, available - used)
      nextHistory.unshift({
        id: crypto.randomUUID(),
        itemId: item.id,
        type: 'Stock used',
        quantity: used,
        date: new Date().toISOString(),
        note: `Automatic use for ${treatment.treatmentName} · Patient ${treatment.patientName}`,
      })
    }

    if (available < requirement.quantity) {
      warnings.push(
        `${item.name}: required ${requirement.quantity} ${item.unit}, available ${available} ${item.unit}. Short by ${requirement.quantity - available}.`
      )
    } else if (item.quantity <= Number(item.minimumStock || 0)) {
      warnings.push(
        `${item.name} is now at/below its minimum stock level (${item.quantity} ${item.unit} remaining).`
      )
    }
  })

  return { inventory: nextInventory, history: nextHistory, warnings }
}

export function TreatmentsPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [patients, setPatients] = useState<Patient[]>(loadPatients)
  const [treatments, setTreatments] = useState<Treatment[]>(loadTreatments)
  const [appointments, setAppointments] = useState<Appointment[]>(loadAppointments)
  const [catalogue, setCatalogue] = useState<TreatmentCatalogueItem[]>(() => loadCatalogue(loadTreatments()))
  const [inventory, setInventory] = useState<InventoryItem[]>(loadInventory)
  const [inventoryHistory, setInventoryHistory] = useState<StockAction[]>(loadInventoryHistory)

  const [search, setSearch] = useState('')
  const [catalogueSearch, setCatalogueSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [showNewTreatment, setShowNewTreatment] = useState(false)
  const [newTreatmentName, setNewTreatmentName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<TreatmentForm>(emptyForm)
  const [formError, setFormError] = useState('')
  const [inventoryWarnings, setInventoryWarnings] = useState<string[]>([])
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'completed' | 'value'>('all')
  const [statusMenuId, setStatusMenuId] = useState<string | null>(null)
  const [statusMenuPosition, setStatusMenuPosition] = useState<{ top: number; left: number } | null>(null)
  const [progressTreatment, setProgressTreatment] = useState<Treatment | null>(null)
  const [progressStatus, setProgressStatus] = useState<TreatmentStatus>('In progress')
  const [progressVisits, setProgressVisits] = useState('')
  const [progressError, setProgressError] = useState('')
  const [progressWarnings, setProgressWarnings] = useState<string[]>([])
  const [needsAnotherVisit, setNeedsAnotherVisit] = useState(false)
  const [progressNextVisit, setProgressNextVisit] = useState('')
  const [progressNextVisitTime, setProgressNextVisitTime] = useState('')
  const [historyTreatment, setHistoryTreatment] = useState<Treatment | null>(null)

  const progressDaySlots = useMemo(
    () => getTreatmentDaySlots(progressNextVisit, appointments),
    [appointments, progressNextVisit],
  )

  const availableProgressDaySlots = useMemo(
    () => progressDaySlots.filter((slot) => slot.available),
    [progressDaySlots],
  )

  useEffect(() => {
    const refresh = () => {
      const nextTreatments = loadTreatments()
      setPatients(loadPatients())
      setAppointments(loadAppointments())
      setTreatments(nextTreatments)
      setCatalogue(loadCatalogue(nextTreatments))
      setInventory(loadInventory())
      setInventoryHistory(loadInventoryHistory())
    }
    window.addEventListener('storage', refresh)
    return () => window.removeEventListener('storage', refresh)
  }, [])

  useEffect(() => {
    localStorage.setItem(TREATMENTS_STORAGE_KEY, JSON.stringify(treatments))
  }, [treatments])

  useEffect(() => {
    if (!statusMenuId) return
    const closeMenu = () => {
      setStatusMenuId(null)
      setStatusMenuPosition(null)
    }
    window.addEventListener('scroll', closeMenu, true)
    window.addEventListener('resize', closeMenu)
    return () => {
      window.removeEventListener('scroll', closeMenu, true)
      window.removeEventListener('resize', closeMenu)
    }
  }, [statusMenuId])

  useEffect(() => {
    localStorage.setItem(CATALOGUE_STORAGE_KEY, JSON.stringify(
      catalogue.filter((item) => item.custom)
    ))
  }, [catalogue])

  const summary = useMemo(() => ({
    total: treatments.length,
    active: treatments.filter((t) => t.status === 'In progress' || t.status === 'Partially completed').length,
    completed: treatments.filter((t) => t.status === 'Completed').length,
    value: treatments.reduce((sum, t) => sum + t.cost, 0),
  }), [treatments])

  const filteredTreatments = useMemo(() => {
    const query = search.trim().toLowerCase()
    let result = treatments

    if (activeFilter === 'active') result = result.filter((t) => t.status === 'In progress' || t.status === 'Partially completed')
    if (activeFilter === 'completed') result = result.filter((t) => t.status === 'Completed')

    if (query) {
      result = result.filter((t) =>
        [t.patientName, t.treatmentName, t.tooth, t.diagnosis, t.status]
          .join(' ').toLowerCase().includes(query)
      )
    }

    return result
  }, [search, treatments, activeFilter])

  const visibleCatalogue = useMemo(() => {
    const query = catalogueSearch.trim().toLowerCase()
    if (!query) return catalogue
    return catalogue.filter((item) => item.name.toLowerCase().includes(query))
  }, [catalogue, catalogueSearch])

  useEffect(() => {
    const patientId = searchParams.get('patientId')
    if (!patientId) return
    if (!patients.some((p) => p.id === patientId)) {
      setSearchParams({}, { replace: true })
      return
    }
    setEditingId(null)
    setForm({ ...emptyForm, patientId, startDate: getLocalDateString() })
    setFormError('')
    setInventoryWarnings([])
    setShowForm(true)
    setSearchParams({}, { replace: true })
  }, [patients, searchParams, setSearchParams])

  function openNewTreatment() {
    setEditingId(null)
    setForm({ ...emptyForm, startDate: getLocalDateString() })
    setFormError('')
    setInventoryWarnings([])
    setCatalogueSearch('')
    setShowForm(true)
  }

  function selectCatalogueTreatment(name: string) {
    setForm((current) => ({ ...current, treatmentName: name }))
    setCatalogueSearch('')
  }

  function addCustomTreatment() {
    const name = newTreatmentName.trim()
    if (!name) return

    const existing = catalogue.find((item) => normalizeName(item.name) === normalizeName(name))
    if (existing) {
      selectCatalogueTreatment(existing.name)
      setNewTreatmentName('')
      setShowNewTreatment(false)
      return
    }

    const item: TreatmentCatalogueItem = {
      id: crypto.randomUUID(),
      name,
      usageCount: 0,
      createdAt: new Date().toISOString(),
      custom: true,
    }
    setCatalogue((current) => [item, ...current])
    setForm((current) => ({ ...current, treatmentName: name }))
    setNewTreatmentName('')
    setShowNewTreatment(false)
  }

  function openEditTreatment(treatment: Treatment) {
    setEditingId(treatment.id)
    setForm({
      patientId: treatment.patientId,
      treatmentName: treatment.treatmentName,
      tooth: treatment.tooth,
      diagnosis: treatment.diagnosis,
      status: treatment.status,
      plannedVisits: treatment.plannedVisits,
      completedVisits: treatment.completedVisits,
      cost: treatment.cost,
      startDate: treatment.startDate,
      nextVisit: treatment.nextVisit,
      notes: treatment.notes,
    })
    setInventoryWarnings(treatment.inventoryWarnings || [])
    setFormError('')
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingId(null)
    setForm(emptyForm)
    setFormError('')
    setInventoryWarnings([])
  }

  function saveInventory(nextInventory: InventoryItem[], nextHistory: StockAction[]) {
    setInventory(nextInventory)
    setInventoryHistory(nextHistory)
    localStorage.setItem(INVENTORY_STORAGE_KEY, JSON.stringify(nextInventory))
    localStorage.setItem(INVENTORY_HISTORY_KEY, JSON.stringify(nextHistory))
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!form.patientId) return setFormError('Please select a patient.')
    if (!form.treatmentName.trim()) return setFormError('Please select or enter a treatment.')
    if (!isTreatmentStatus(form.status)) return setFormError('Please select a valid treatment status.')
    if (!Number.isSafeInteger(form.plannedVisits) || form.plannedVisits < 1 || form.plannedVisits > MAX_PLANNED_VISITS) {
      return setFormError(`Planned visits must be a whole number from 1 to ${MAX_PLANNED_VISITS}.`)
    }
    if (!Number.isSafeInteger(form.completedVisits) || form.completedVisits < 0 || form.completedVisits > form.plannedVisits) {
      return setFormError('Completed visits must be a whole number between 0 and planned visits.')
    }
    if (form.status === 'Completed' && form.completedVisits !== form.plannedVisits) {
      return setFormError('A completed treatment must have all currently planned visits completed.')
    }
    if (form.status === 'Partially completed' && form.completedVisits >= form.plannedVisits) {
      return setFormError('All currently planned visits are complete. Mark it Completed or use the quick status update to schedule another visit.')
    }
    if (
      form.cost === '' ||
      !Number.isSafeInteger(Number(form.cost)) ||
      Number(form.cost) <= 0 ||
      Number(form.cost) > MAX_TREATMENT_COST
    ) {
      return setFormError('Treatment cost is required and must be a whole number greater than ₹0.')
    }

    const treatmentCost = Number(form.cost)
    if (!form.startDate || !isValidDateString(form.startDate)) return setFormError('Please select a valid treatment start date.')
    if (form.nextVisit && (!isValidDateString(form.nextVisit) || form.nextVisit < form.startDate)) {
      return setFormError('Next visit must be a valid date on or after the treatment start date.')
    }

    const patient = patients.find((p) => p.id === form.patientId)
    if (!patient) return setFormError('The selected patient could not be found.')

    const oldTreatment = editingId ? treatments.find((t) => t.id === editingId) : undefined
    const shouldApplyInventory =
      !editingId &&
      (form.status === 'In progress' ||
        form.status === 'Partially completed' ||
        form.status === 'Completed')

    let usageApplied = oldTreatment?.inventoryUsageApplied === true
    let warnings: string[] = oldTreatment?.inventoryWarnings || []

    if (shouldApplyInventory && !usageApplied) {
      const result = applyInventoryForTreatment({
        id: '',
        patientId: patient.id,
        patientName: patient.name,
        treatmentName: form.treatmentName.trim(),
        tooth: form.tooth.trim(),
        diagnosis: form.diagnosis.trim(),
        status: form.status,
        plannedVisits: form.plannedVisits,
        completedVisits: form.completedVisits,
        cost: treatmentCost,
        startDate: form.startDate,
        nextVisit: form.nextVisit,
        notes: form.notes.trim(),
        createdAt: new Date().toISOString(),
      }, inventory, inventoryHistory)

      saveInventory(result.inventory, result.history)
      warnings = result.warnings
      usageApplied = true
      setInventoryWarnings(warnings)
    }

    let updatedTreatments: Treatment[]

    if (editingId) {
      updatedTreatments = treatments.map((t) =>
        t.id === editingId ? {
          ...t,
          patientId: patient.id,
          patientName: patient.name,
          treatmentName: form.treatmentName.trim(),
          tooth: form.tooth.trim(),
          diagnosis: form.diagnosis.trim(),
          status: form.status,
          plannedVisits: form.plannedVisits,
          completedVisits: form.completedVisits,
          cost: treatmentCost,
          startDate: form.startDate,
          nextVisit: form.nextVisit,
          notes: form.notes.trim(),
          progressHistory: oldTreatment?.progressHistory || [],
          inventoryUsageApplied: usageApplied,
          inventoryWarnings: warnings,
        } : t
      )
    } else {
      const now = new Date().toISOString()
      const newTreatment: Treatment = {
        id: crypto.randomUUID(),
        patientId: patient.id,
        patientName: patient.name,
        treatmentName: form.treatmentName.trim(),
        tooth: form.tooth.trim(),
        diagnosis: form.diagnosis.trim(),
        status: form.status,
        plannedVisits: form.plannedVisits,
        completedVisits: form.completedVisits,
        cost: treatmentCost,
        startDate: form.startDate,
        nextVisit: form.nextVisit,
        notes: form.notes.trim(),
        createdAt: now,
        progressHistory: [],
        whatsappHistory: (() => {
          const appointment = appointments.find(
            (item) =>
              item.patientId === patient.id &&
              item.status !== 'Cancelled' &&
              item.status !== 'No show',
          )
          const appointmentHistory = appointment
            ? (appointment as typeof appointment & { whatsappHistory?: AppointmentWhatsAppHistory }).whatsappHistory
            : undefined

          return appointmentHistory?.initialSentAt
            ? [{ id: crypto.randomUUID(), kind: 'initial' as const, sentAt: appointmentHistory.initialSentAt }]
            : []
        })(),
        inventoryUsageApplied: usageApplied,
        inventoryUsageAppliedAt: usageApplied ? now : undefined,
        inventoryWarnings: warnings,
      }

      updatedTreatments = [newTreatment, ...treatments]
    }

    // Persist immediately. Billing may be opened in the same browser tab,
    // where the browser will not emit a "storage" event to the same document.
    setTreatments(updatedTreatments)
    localStorage.setItem(TREATMENTS_STORAGE_KEY, JSON.stringify(updatedTreatments))

    closeForm()
  }

  function openStatusMenu(treatmentId: string, button: HTMLButtonElement) {
    if (statusMenuId === treatmentId) {
      setStatusMenuId(null)
      setStatusMenuPosition(null)
      return
    }

    const rect = button.getBoundingClientRect()
    const menuWidth = 208
    const menuHeight = 300
    const gap = 8
    const top = rect.bottom + gap + menuHeight > window.innerHeight
      ? Math.max(8, rect.top - menuHeight - gap)
      : rect.bottom + gap
    const left = Math.min(
      Math.max(8, rect.right - menuWidth),
      Math.max(8, window.innerWidth - menuWidth - 8),
    )

    setStatusMenuPosition({ top, left })
    setStatusMenuId(treatmentId)
  }

  function openProgressUpdate(treatment: Treatment, requestedStatus: TreatmentStatus) {
    setStatusMenuId(null)
    setProgressTreatment(treatment)
    setProgressStatus(requestedStatus)
    setProgressVisits(
      String(
        requestedStatus === 'Completed'
          ? treatment.plannedVisits
          : treatment.completedVisits,
      ),
    )
    setNeedsAnotherVisit(false)
    setProgressNextVisit(treatment.nextVisit || '')
    const existingNextAppointment = treatment.nextVisit
      ? loadAppointments()
          .filter(
            (appointment) =>
              appointment.patientId === treatment.patientId &&
              appointment.date === treatment.nextVisit &&
              appointment.status !== 'Cancelled' &&
              appointment.status !== 'No show',
          )
          .sort((a, b) => a.time.localeCompare(b.time))[0]
      : undefined
    setProgressNextVisitTime(existingNextAppointment?.time || '')
    setProgressError('')
    setProgressWarnings([])
  }

  function closeProgressUpdate() {
    setProgressTreatment(null)
    setProgressError('')
    setProgressWarnings([])
    setNeedsAnotherVisit(false)
    setProgressNextVisit('')
    setProgressNextVisitTime('')
  }

  function saveProgressUpdate() {
    const treatment = progressTreatment
    if (!treatment) return

    if (progressVisits.trim() === '' || !/^\d+$/.test(progressVisits)) {
      setProgressError('Completed visits must be a whole number between 0 and planned visits.')
      return
    }

    let completedVisits = Number(progressVisits)
    let plannedVisits = treatment.plannedVisits
    let nextVisit = progressNextVisit

    if (!Number.isSafeInteger(completedVisits) || completedVisits < 0) {
      setProgressError('Completed visits must be a whole number greater than or equal to 0.')
      return
    }

    if (progressStatus === 'Completed') {
      completedVisits = plannedVisits
      nextVisit = ''
    }

    if (progressStatus === 'Partially completed') {
      if (completedVisits > plannedVisits) {
        setProgressError(`Completed visits cannot exceed the current planned visits (${plannedVisits}).`)
        return
      }

      if (needsAnotherVisit) {
        if (completedVisits < 1) {
          setProgressError('Record at least one completed visit before scheduling another visit.')
          return
        }

        if (completedVisits >= MAX_PLANNED_VISITS) {
          setProgressError(`The treatment cannot exceed ${MAX_PLANNED_VISITS} planned visits.`)
          return
        }

        if (!nextVisit || !isValidDateString(nextVisit)) {
          setProgressError('Select the next visit date before scheduling another visit.')
          return
        }

        if (treatment.startDate && nextVisit < treatment.startDate) {
          setProgressError('Next visit must be on or after the treatment start date.')
          return
        }

        if (!progressNextVisitTime) {
          setProgressError('Select the next visit time before scheduling another visit.')
          return
        }

        const freshAppointments = loadAppointments()
        const availableSlots = getTreatmentDaySlots(nextVisit, freshAppointments)
        if (!availableSlots.some((slot) => slot.value === progressNextVisitTime && slot.available)) {
          setProgressError('That appointment time is no longer available. Please choose another available slot.')
          return
        }

        // The appointment currently associated with this treatment's next visit
        // is the appointment we are rescheduling. It must not make its own
        // current slot appear occupied while the user chooses a new slot.
        const currentNextAppointment = freshAppointments.find(
          (appointment) =>
            appointment.patientId === treatment.patientId &&
            appointment.date === treatment.nextVisit &&
            appointment.status !== 'Cancelled' &&
            appointment.status !== 'No show',
        )

        const availableSlotsForReschedule = getTreatmentDaySlots(
          nextVisit,
          currentNextAppointment
            ? freshAppointments.filter((appointment) => appointment.id !== currentNextAppointment.id)
            : freshAppointments,
        )

        if (
          !availableSlotsForReschedule.some(
            (slot) => slot.value === progressNextVisitTime && slot.available,
          )
        ) {
          setProgressError(
            'That appointment time is no longer available. Please choose another available slot.',
          )
          return
        }

        if (completedVisits >= plannedVisits) {
          plannedVisits = completedVisits + 1
        } else {
          plannedVisits = Math.max(plannedVisits, completedVisits + 1)
        }
      } else {
        if (completedVisits >= plannedVisits) {
          setProgressError('All currently planned visits are complete. Select "Schedule another visit" or mark the treatment Completed.')
          return
        }
        if (completedVisits <= 0) {
          setProgressError('Partially completed requires at least one completed visit.')
          return
        }
      }
    }

    if (progressStatus === 'In progress') {
      if (completedVisits > plannedVisits) {
        setProgressError(`Completed visits cannot exceed the current planned visits (${plannedVisits}).`)
        return
      }
      if (completedVisits >= plannedVisits && plannedVisits > 1) {
        setProgressError('If all planned visits are complete, use Completed instead.')
        return
      }
    }

    let usageApplied = treatment.inventoryUsageApplied === true
    let warnings = treatment.inventoryWarnings || []

    const enteringActiveCare =
      (progressStatus === 'In progress' ||
        progressStatus === 'Partially completed' ||
        progressStatus === 'Completed') &&
      !usageApplied

    if (enteringActiveCare) {
      const result = applyInventoryForTreatment(treatment, inventory, inventoryHistory)
      saveInventory(result.inventory, result.history)
      warnings = result.warnings
      usageApplied = true
    }

    const now = new Date().toISOString()
    const historyEntry: TreatmentProgressHistory = {
      id: crypto.randomUUID(),
      changedAt: now,
      previousStatus: treatment.status,
      newStatus: progressStatus,
      previousCompletedVisits: treatment.completedVisits,
      completedVisits,
      previousPlannedVisits: treatment.plannedVisits,
      plannedVisits,
      previousNextVisit: treatment.nextVisit,
      nextVisit,
      note: needsAnotherVisit
        ? 'Treatment progress updated and another visit scheduled.'
        : progressStatus === 'Completed'
          ? 'Treatment marked completed.'
          : 'Treatment progress/status updated.',
    }

    // Appointments remains the source of truth for the follow-up date/time.
    // If this treatment already has a future appointment, move that appointment
    // to the newly selected slot instead of creating a second appointment for
    // the same treatment/patient.
    if (progressStatus === 'Partially completed' && needsAnotherVisit) {
      const freshAppointments = loadAppointments()

      const currentNextAppointment = freshAppointments.find(
        (appointment) =>
          appointment.patientId === treatment.patientId &&
          appointment.date === treatment.nextVisit &&
          appointment.status !== 'Cancelled' &&
          appointment.status !== 'No show',
      )

      let updatedAppointments: Appointment[]

      if (currentNextAppointment) {
        updatedAppointments = freshAppointments.map((appointment) =>
          appointment.id === currentNextAppointment.id
            ? {
                ...appointment,
                date: nextVisit,
                time: progressNextVisitTime,
                reason: `Treatment follow-up — ${treatment.treatmentName}`,
                notes: appointment.notes || 'Scheduled from treatment progress update.',
                plannedTreatments:
                  appointment.plannedTreatments || treatment.treatmentName,
              }
            : appointment,
        )
      } else {
        const followUpAppointment: Appointment = {
          id: crypto.randomUUID(),
          patientId: treatment.patientId,
          patientName: treatment.patientName,
          date: nextVisit,
          time: progressNextVisitTime,
          reason: `Treatment follow-up — ${treatment.treatmentName}`,
          status: 'Scheduled',
          notes: 'Scheduled from treatment progress update.',
          requiredVisits: '1',
          plannedTreatments: treatment.treatmentName,
        }

        updatedAppointments = [followUpAppointment, ...freshAppointments]
      }

      setAppointments(updatedAppointments)
      localStorage.setItem(
        APPOINTMENTS_STORAGE_KEY,
        JSON.stringify(updatedAppointments),
      )
    }

    const updatedTreatments = treatments.map((item) =>
      item.id === treatment.id
        ? {
            ...item,
            status: progressStatus,
            completedVisits,
            plannedVisits,
            nextVisit,
            progressHistory: [...(item.progressHistory || []), historyEntry],
            inventoryUsageApplied: usageApplied,
            inventoryUsageAppliedAt: usageApplied
              ? (item.inventoryUsageAppliedAt || now)
              : undefined,
            inventoryWarnings: warnings,
          }
        : item,
    )

    // Persist immediately before navigation. This guarantees BillingPage sees
    // the just-saved treatment instead of an older localStorage snapshot.
    setTreatments(updatedTreatments)
    localStorage.setItem(TREATMENTS_STORAGE_KEY, JSON.stringify(updatedTreatments))

    // Inventory warnings are deliberately non-blocking. Automatic deduction
    // has still occurred as far as stock permitted, and the status is saved.
    const shouldGoToBilling = progressStatus === 'Partially completed' || progressStatus === 'Completed'
    closeProgressUpdate()
    if (shouldGoToBilling) {
      navigate(`/billing?patientId=${encodeURIComponent(treatment.patientId)}&treatmentId=${encodeURIComponent(treatment.id)}&source=treatment`)
    }
  }

  function deleteTreatment(id: string) {
    if (!window.confirm('Delete this treatment record? This action cannot be undone.')) return
    setTreatments((current) => current.filter((t) => t.id !== id))
  }

  function sendTreatmentWhatsApp(treatment: Treatment | undefined) {
    const appointments = loadAppointments()

    // When creating a new treatment there is no treatment record yet.
    // In that case, WhatsApp sends the appointment welcome message and
    // records the send against the appointment so it is not duplicated later.
    if (!treatment) {
      const patient = patients.find((p) => p.id === form.patientId)
      if (!patient?.phone) {
        window.alert('Select a patient with a valid mobile number first.')
        return
      }

      const appointmentIndex = appointments.findIndex(
        (item) =>
          item.patientId === patient.id &&
          item.status !== 'Cancelled' &&
          item.status !== 'No show',
      )

      if (appointmentIndex < 0) {
        window.alert('No booked appointment was found for this patient.')
        return
      }

      const appointment = appointments[appointmentIndex]
      const existingHistory = (appointment as typeof appointment & {
        whatsappHistory?: AppointmentWhatsAppHistory
      }).whatsappHistory

      if (existingHistory?.initialSentAt) {
        window.alert('The appointment welcome message has already been sent on WhatsApp.')
        return
      }

      const appointmentDate = new Date(`${appointment.date}T00:00:00`).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })

      const message = [
        'Welcome to Joshi Dental Clinic.',
        'Your appointment is booked.',
        `Patient ID: ${patient.patientNumber || 'Not assigned'}.`,
        `Date: ${appointmentDate} at ${formatTime(appointment.time)}.`,
      ].join('\n')

      const updatedAppointments = appointments.map((item, index) =>
        index === appointmentIndex
          ? {
              ...item,
              whatsappHistory: {
                ...(item as typeof item & { whatsappHistory?: AppointmentWhatsAppHistory }).whatsappHistory,
                initialSentAt: new Date().toISOString(),
              },
            }
          : item,
      )

      localStorage.setItem(APPOINTMENTS_STORAGE_KEY, JSON.stringify(updatedAppointments))
      const url = getWhatsAppUrl(patient.phone, message)
      if (url) window.open(url, '_blank', 'noopener,noreferrer')
      return
    }

    const liveTreatments = loadTreatments()
    const liveTreatment = liveTreatments.find((item) => item.id === treatment.id) ?? treatment
    const patient = patients.find((p) => p.id === liveTreatment.patientId)

    if (!patient?.phone) {
      window.alert('This patient does not have a valid mobile number for WhatsApp.')
      return
    }

    const whatsappHistory = liveTreatment.whatsappHistory || []
    const hasInitialMessage = whatsappHistory.some((entry) => entry.kind === 'initial')
    const lastStatusMessage = [...whatsappHistory]
      .filter((entry) => entry.kind === 'status' && entry.status)
      .sort((a, b) => a.sentAt.localeCompare(b.sentAt))
      .at(-1)

    const appointment = appointments
      .filter((item) => item.patientId === liveTreatment.patientId && item.status !== 'Cancelled' && item.status !== 'No show')
      .sort((a, b) => new Date(`${a.date}T${a.time || '00:00'}`).getTime() - new Date(`${b.date}T${b.time || '00:00'}`).getTime())[0]

    let message = ''
    let historyEntry: TreatmentWhatsAppHistory

    if (!hasInitialMessage) {
      if (!appointment) {
        window.alert('No booked appointment was found for this patient, so the initial WhatsApp booking message cannot be prepared.')
        return
      }

      const appointmentDate = new Date(`${appointment.date}T00:00:00`).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })

      message = [
        'Welcome to Joshi Dental Clinic.',
        'Your appointment is booked.',
        `Patient ID: ${patient.patientNumber || 'Not assigned'}.`,
        `Date: ${appointmentDate} at ${formatTime(appointment.time)}.`,
      ].join('\n')

      historyEntry = { id: crypto.randomUUID(), kind: 'initial', sentAt: new Date().toISOString() }
    } else {
      if (lastStatusMessage?.status === liveTreatment.status) {
        window.alert('No new treatment status change is available to send on WhatsApp.')
        return
      }

      if (liveTreatment.status === 'Partially completed') {
        const scheduleAppointment = getNextAppointment(appointments, liveTreatment.patientId)
        const schedule = scheduleAppointment
          ? `${formatDate(scheduleAppointment.date)} at ${formatTime(scheduleAppointment.time)}`
          : liveTreatment.nextVisit
            ? formatDate(liveTreatment.nextVisit)
            : 'to be scheduled'

        message = [
          'Your treatment status has been updated to Partially completed.',
          `Hence, your new schedule is as follows: ${schedule}.`,
          '',
          'Thanks for choosing Joshi Dental Clinic.',
        ].join('\n')
      } else if (liveTreatment.status === 'Completed') {
        const invoices = loadInvoices()
        const invoice = invoices
          .filter((item) => item.patientId === liveTreatment.patientId)
          .find((item) => item.items.some((invoiceItem) => invoiceItem.treatmentId === liveTreatment.id))

        if (!invoice) {
          window.alert('This treatment is completed, but its invoice has not been generated yet. Please create the invoice in Billing before sending the completion message.')
          return
        }

        const paymentStatus = invoice.paymentStatus === 'Paid'
          ? 'Fully paid'
          : invoice.paymentStatus === 'Partially paid'
            ? 'Partially paid'
            : 'Unpaid'
        const amountPaid = invoice.amountPaid
        const remaining = Math.max(0, invoice.total - amountPaid)

        message = [
          'Your treatment is completed. Thanks for choosing Joshi Dental Clinic.',
          `Total invoice generated: ₹${invoice.total.toLocaleString('en-IN')}`,
          `Amount paid: ₹${amountPaid.toLocaleString('en-IN')}`,
          `Remaining amount: ₹${remaining.toLocaleString('en-IN')}`,
          `Payment status: ${paymentStatus}`,
          `Mode of payment: ${invoice.paymentMethod ?? 'Not recorded'}`,
        ].join('\n')
      } else {
        message = [
          `Your treatment status has been updated to ${liveTreatment.status}.`,
          'Thanks for choosing Joshi Dental Clinic.',
        ].join('\n')
      }

      historyEntry = {
        id: crypto.randomUUID(),
        kind: 'status',
        status: liveTreatment.status,
        sentAt: new Date().toISOString(),
      }
    }

    const updatedTreatments = liveTreatments.map((item) =>
      item.id === liveTreatment.id
        ? { ...item, whatsappHistory: [...(item.whatsappHistory || []), historyEntry] }
        : item,
    )
    setTreatments(updatedTreatments)
    localStorage.setItem(TREATMENTS_STORAGE_KEY, JSON.stringify(updatedTreatments))

    const url = getWhatsAppUrl(patient.phone, message)
    if (url) window.open(url, '_blank', 'noopener,noreferrer')
  }

  function canSendTreatmentWhatsApp(treatment: Treatment | undefined) {
    if (!treatment) {
      const patient = patients.find((p) => p.id === form.patientId)
      if (!patient?.phone) return false

      const appointment = appointments.find(
        (item) =>
          item.patientId === patient.id &&
          item.status !== 'Cancelled' &&
          item.status !== 'No show',
      )
      if (!appointment) return false

      const history = (appointment as typeof appointment & {
        whatsappHistory?: AppointmentWhatsAppHistory
      }).whatsappHistory

      return !history?.initialSentAt
    }

    const history = treatment.whatsappHistory || []
    if (!history.some((entry) => entry.kind === 'initial')) return true

    const lastStatus = [...history]
      .filter((entry) => entry.kind === 'status' && entry.status)
      .sort((a, b) => a.sentAt.localeCompare(b.sentAt))
      .at(-1)

    return lastStatus?.status !== treatment.status
  }

  const selectedPatientAppointment = form.patientId
    ? getNextAppointment(appointments, form.patientId)
    : undefined

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-medium text-clinic-teal">Clinical</p>
          <h1 className="mt-1 font-display text-4xl font-semibold text-clinic-ink">Treatments</h1>
          <p className="mt-2 text-sm text-clinic-ink/60">
            Manage treatment plans, clinical progress and automatic inventory usage.
          </p>
        </div>
        <button type="button" onClick={openNewTreatment}
          className="rounded-xl bg-clinic-teal px-5 py-3 text-sm font-semibold text-white hover:opacity-90">
          + New Treatment
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Total treatments" value={String(summary.total)}
          active={activeFilter === 'all'} onClick={() => setActiveFilter('all')} />
        <SummaryCard label="In progress" value={String(summary.active)}
          active={activeFilter === 'active'} onClick={() => setActiveFilter('active')} />
        <SummaryCard label="Completed" value={String(summary.completed)}
          active={activeFilter === 'completed'} onClick={() => setActiveFilter('completed')} />
        <SummaryCard label="Treatment value" value={formatCurrency(summary.value)}
          active={activeFilter === 'value'} onClick={() => setActiveFilter('value')} />
      </div>

      <div className="rounded-2xl border border-clinic-line bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-display text-xl font-semibold">Treatment records</h2>
            <p className="mt-1 text-sm text-clinic-ink/50">
              Click a summary card to filter the records below.
            </p>
          </div>
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search patient, treatment, tooth or diagnosis..."
            className="w-full rounded-xl border border-clinic-line bg-clinic-paper px-4 py-3 text-sm outline-none focus:border-clinic-teal md:w-96" />
        </div>

        <div className="mt-5 overflow-x-auto">
          {filteredTreatments.length === 0 ? (
            <div className="rounded-xl border border-dashed border-clinic-line bg-clinic-paper p-10 text-center">
              <h3 className="font-semibold">{search ? 'No treatments found' : 'No treatment records yet'}</h3>
              <p className="mt-2 text-sm text-clinic-ink/50">
                {search ? 'Try a different search term.' : 'Create a treatment record to start tracking clinical care.'}
              </p>
            </div>
          ) : (
            <table className="w-full min-w-[1000px] text-left">
              <thead>
                <tr className="border-b border-clinic-line text-xs uppercase tracking-wide text-clinic-ink/40">
                  <th className="px-4 py-3">Patient</th>
                  <th className="px-4 py-3">Treatment</th>
                  <th className="px-4 py-3">Tooth</th>
                  <th className="px-4 py-3">Progress</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Cost</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTreatments.map((treatment) => {
                  const searchQuery = search.trim()
                  const searchMatch = searchQuery.length > 0
                  return (
                    <tr key={treatment.id} className={`border-b border-clinic-line/70 last:border-0 transition ${searchMatch ? 'bg-yellow-50/70' : ''}`}>
                      <td className="px-4 py-4">
                        <div className="font-medium">{highlightMatch(treatment.patientName, searchQuery)}</div>
                        {treatment.diagnosis && <div className="mt-1 max-w-[220px] truncate text-xs text-clinic-ink/45">{treatment.diagnosis}</div>}
                      </td>
                      <td className="px-4 py-4 text-sm font-medium">{highlightMatch(treatment.treatmentName, searchQuery)}</td>
                      <td className="px-4 py-4 text-sm text-clinic-ink/60">{treatment.tooth || '—'}</td>
                      <td className="px-4 py-4">
                        <div className="text-sm font-medium">{treatment.completedVisits} / {treatment.plannedVisits} visits</div>
                        {treatment.nextVisit && treatment.status !== 'Completed' && (
                          <div className="mt-1 text-xs text-clinic-ink/50">Next: {formatDate(treatment.nextVisit)}</div>
                        )}
                        <div className="mt-2 h-1.5 w-28 overflow-hidden rounded-full bg-clinic-line">
                          <div className="h-full rounded-full bg-clinic-teal"
                            style={{ width: `${Math.min(100, treatment.completedVisits / treatment.plannedVisits * 100)}%` }} />
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getStatusClasses(treatment.status)}`}>
                          {treatment.status}
                        </span>
                        {treatment.inventoryWarnings?.length ? (
                          <div className="mt-2 text-xs font-medium text-amber-700">⚠ Inventory warning</div>
                        ) : null}
                      </td>
                      <td className="px-4 py-4 text-sm font-medium">{formatCurrency(treatment.cost)}</td>
                      <td className="px-4 py-4">
                        <div className="flex justify-end gap-2">
                          <button type="button"
                            onClick={(event) => openStatusMenu(treatment.id, event.currentTarget)}
                            className={`rounded-lg border px-3 py-2 text-xs font-semibold ${getStatusClasses(treatment.status)} hover:opacity-80`}>
                            Status ▾
                          </button>
                          <button type="button" onClick={() => sendTreatmentWhatsApp(treatment)}
                            disabled={!canSendTreatmentWhatsApp(treatment)}
                            title={canSendTreatmentWhatsApp(treatment) ? 'Open the latest WhatsApp message' : 'No new status change to send'}
                            className="rounded-lg border border-green-200 px-3 py-2 text-xs font-semibold text-green-700 hover:bg-green-50 disabled:cursor-not-allowed disabled:opacity-40">
                            WhatsApp
                          </button>
                          <button type="button" onClick={() => openEditTreatment(treatment)}
                            className="rounded-lg border border-clinic-line px-3 py-2 text-xs font-semibold hover:bg-clinic-paper">
                            Edit
                          </button>
                          <button type="button" onClick={() => deleteTreatment(treatment.id)}
                            className="rounded-lg px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50">
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {statusMenuId && statusMenuPosition && (
        <div
          className="fixed z-[100] w-52 rounded-xl border border-clinic-line bg-white p-1.5 shadow-2xl"
          style={{ top: statusMenuPosition.top, left: statusMenuPosition.left }}
        >
          {(['Planned', 'In progress', 'Partially completed', 'Completed', 'On hold', 'Cancelled'] as TreatmentStatus[]).map((status) => {
            const treatment = treatments.find((item) => item.id === statusMenuId)
            if (!treatment) return null
            return (
              <button key={status} type="button"
                onClick={() => {
                  if (status === 'Completed' || status === 'Partially completed' || status === 'In progress') {
                    openProgressUpdate(treatment, status)
                  } else {
                    setStatusMenuId(null)
                    setStatusMenuPosition(null)
                    setTreatments((current) => current.map((item) => item.id === treatment.id ? { ...item, status } : item))
                  }
                }}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-semibold hover:bg-clinic-paper ${status === treatment.status ? 'bg-clinic-paper' : ''}`}>
                <span>{status}</span>
                {status === treatment.status && <span>✓</span>}
              </button>
            )
          })}
        </div>
      )}

      {progressTreatment && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="border-b border-clinic-line px-6 py-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-clinic-teal">Quick status update</p>
                  <h2 className="mt-1 font-display text-2xl font-semibold">{progressTreatment.treatmentName}</h2>
                  <p className="mt-1 text-sm text-clinic-ink/55">{progressTreatment.patientName}</p>
                </div>
                <button type="button" onClick={closeProgressUpdate} className="rounded-lg px-3 py-2 text-xl text-clinic-ink/50 hover:bg-clinic-paper">×</button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-6">
              <div className="space-y-5">
              <Field label="Status">
                <select value={progressStatus} onChange={(e) => {
                  const status = e.target.value as TreatmentStatus
                  setProgressStatus(status)
                  if (status === 'Completed') setProgressVisits(String(progressTreatment.plannedVisits))
                }} className="input-field">
                  <option>In progress</option>
                  <option>Partially completed</option>
                  <option>Completed</option>
                </select>
              </Field>

              <Field label={`Completed visits (currently planned: ${progressTreatment.plannedVisits})`}>
                <input
                  type="number"
                  min="0"
                  max={MAX_PLANNED_VISITS}
                  step="1"
                  value={progressVisits}
                  disabled={progressStatus === 'Completed'}
                  onChange={(e) => {
                    const value = e.target.value
                    if (value === '' || /^\d+$/.test(value)) {
                      setProgressVisits(value)
                      setProgressError('')
                    }
                  }}
                  onBlur={() => {
                    if (progressVisits === '') {
                      setProgressError('Enter the number of completed visits.')
                    }
                  }}
                  className="input-field disabled:cursor-not-allowed disabled:bg-clinic-paper"
                />
              </Field>

              {progressStatus === 'Partially completed' && (
                <div className="rounded-xl border border-clinic-teal/20 bg-clinic-teal/5 p-4">
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={needsAnotherVisit}
                      onChange={(e) => setNeedsAnotherVisit(e.target.checked)}
                      className="mt-1 h-4 w-4"
                    />
                    <span>
                      <span className="block text-sm font-semibold">Does this treatment need another visit?</span>
                      <span className="mt-1 block text-xs text-clinic-ink/55">
                        If yes, the treatment schedule will be extended when necessary and the next visit will be stored in the progress history.
                      </span>
                    </span>
                  </label>

                  {needsAnotherVisit && (
                    <div className="mt-4 space-y-4">
                      <Field label="Next visit date" required>
                        <input
                          type="date"
                          min={getLocalDateString()}
                          value={progressNextVisit}
                          onChange={(e) => {
                            setProgressNextVisit(e.target.value)
                            setProgressNextVisitTime('')
                            setProgressError('')
                          }}
                          className="input-field"
                        />
                      </Field>

                      {progressNextVisit ? (
                        <Field
                          label={isSunday(progressNextVisit) ? 'Next visit time · Sunday' : 'Next visit time'}
                          required
                        >
                          {availableProgressDaySlots.length > 0 ? (
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                              {progressDaySlots.map((slot) => (
                                <button
                                  key={slot.value}
                                  type="button"
                                  disabled={!slot.available}
                                  aria-disabled={!slot.available}
                                  onClick={() => {
                                    if (slot.available) {
                                      setProgressNextVisitTime(slot.value)
                                      setProgressError('')
                                    }
                                  }}
                                  className={`rounded-xl border px-3 py-3 text-sm font-semibold transition ${
                                    progressNextVisitTime === slot.value
                                      ? 'border-clinic-teal bg-clinic-teal text-white shadow-sm'
                                      : slot.available
                                        ? 'border-clinic-line bg-white text-clinic-teal hover:border-clinic-teal/50 hover:bg-clinic-paper'
                                        : 'cursor-not-allowed border-clinic-line bg-clinic-paper text-clinic-ink/30 line-through'
                                  }`}
                                >
                                  {slot.label}
                                </button>
                              ))}
                            </div>
                          ) : (
                            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                              No appointment slots are available on this date. Please choose another date.
                            </div>
                          )}

                          {isSunday(progressNextVisit) && (
                            <p className="mt-2 text-xs text-clinic-ink/55">
                              Sunday follow-up is allowed here as a normal treatment appointment. The same Sunday slot availability rules are used as in Appointments.
                            </p>
                          )}
                        </Field>
                      ) : null}

                      {progressNextVisit && progressNextVisitTime && (
                        <p className="text-xs font-medium text-clinic-teal">
                          Selected schedule: {formatDate(progressNextVisit)} at {formatTime(progressNextVisitTime)}
                        </p>
                      )}

                      {Number(progressVisits) >= progressTreatment.plannedVisits && (
                        <p className="text-xs font-medium text-clinic-teal">
                          Planned visits will increase from {progressTreatment.plannedVisits} to {Math.min(MAX_PLANNED_VISITS, Number(progressVisits) + 1)}.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="rounded-xl border border-clinic-line bg-clinic-paper/60 px-4 py-3 text-sm text-clinic-ink/65">
                <strong>Current:</strong> {progressTreatment.status} · {progressTreatment.completedVisits}/{progressTreatment.plannedVisits} visits
                {progressTreatment.nextVisit && (
                  <span>
                    {' · Next visit: '}
                    {formatDate(progressTreatment.nextVisit)}
                    {(() => {
                      const appointment = appointments.find(
                        (item) =>
                          item.patientId === progressTreatment.patientId &&
                          item.date === progressTreatment.nextVisit &&
                          item.status !== 'Cancelled' &&
                          item.status !== 'No show',
                      )
                      return appointment ? ` at ${formatTime(appointment.time)}` : ''
                    })()}
                  </span>
                )}
              </div>

              {progressError && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{progressError}</div>}
              {progressWarnings.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  <p className="font-semibold">Inventory warning — status can still be saved</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {progressWarnings.map((warning) => <li key={warning}>{warning}</li>)}
                  </ul>
                  <p className="mt-2 text-xs">
                    Automatic deduction was attempted. The status update is not blocked by this warning.
                  </p>
                </div>
              )}

                <div className="flex justify-end gap-3">
                  <button type="button" onClick={closeProgressUpdate} className="rounded-xl border border-clinic-line px-4 py-3 text-sm font-semibold hover:bg-clinic-paper">Cancel</button>
                  <button type="button" onClick={saveProgressUpdate} className="rounded-xl bg-clinic-teal px-5 py-3 text-sm font-semibold text-white hover:opacity-90">Save status</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {historyTreatment && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-clinic-line px-6 py-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-clinic-teal">Progress history</p>
                <h2 className="mt-1 font-display text-2xl font-semibold">{historyTreatment.treatmentName}</h2>
                <p className="mt-1 text-sm text-clinic-ink/55">{historyTreatment.patientName}</p>
              </div>
              <button type="button" onClick={() => setHistoryTreatment(null)}
                className="rounded-lg px-3 py-2 text-xl text-clinic-ink/50 hover:bg-clinic-paper">×</button>
            </div>

            <div className="p-6">
              {(historyTreatment.progressHistory || []).length === 0 ? (
                <div className="rounded-xl border border-dashed border-clinic-line bg-clinic-paper p-8 text-center">
                  <p className="font-semibold">No progress changes recorded yet.</p>
                  <p className="mt-2 text-sm text-clinic-ink/50">
                    Future status, visit-count and schedule changes will appear here.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {[...(historyTreatment.progressHistory || [])].reverse().map((entry) => (
                    <div key={entry.id} className="rounded-xl border border-clinic-line bg-clinic-paper/50 p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold">{entry.previousStatus} → {entry.newStatus}</p>
                          <p className="mt-1 text-xs text-clinic-ink/50">
                            {new Date(entry.changedAt).toLocaleString('en-IN')}
                          </p>
                        </div>
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-clinic-ink/60">
                          {entry.completedVisits}/{entry.plannedVisits} visits
                        </span>
                      </div>

                      <div className="mt-3 grid gap-2 text-xs text-clinic-ink/60 sm:grid-cols-2">
                        <div>
                          <strong>Previous:</strong> {entry.previousCompletedVisits}/{entry.previousPlannedVisits}
                          {entry.previousNextVisit ? ` · Next ${formatDate(entry.previousNextVisit)}` : ''}
                        </div>
                        <div>
                          <strong>Updated:</strong> {entry.completedVisits}/{entry.plannedVisits}
                          {entry.nextVisit ? ` · Next ${formatDate(entry.nextVisit)}` : ''}
                        </div>
                      </div>

                      {entry.note && <p className="mt-3 text-sm text-clinic-ink/65">{entry.note}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-clinic-line px-6 py-5">
              <div>
                <h2 className="font-display text-2xl font-semibold">{editingId ? 'Edit Treatment' : 'New Treatment'}</h2>
                <p className="mt-1 text-sm text-clinic-ink/50">Select a treatment from the catalogue or add a new one.</p>
              </div>
              <button type="button" onClick={closeForm} className="rounded-lg px-3 py-2 text-xl text-clinic-ink/50 hover:bg-clinic-paper">×</button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6 p-6">
              {formError && (
                <div className={`rounded-xl border px-4 py-3 text-sm ${inventoryWarnings.length ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-red-200 bg-red-50 text-red-700'}`}>
                  {formError}
                </div>
              )}

              <div className="rounded-2xl border border-clinic-line bg-clinic-paper/50 p-5">
                <div className="flex flex-col gap-3 lg:flex-row">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-clinic-ink/35">⌕</span>
                    <input type="search" value={catalogueSearch} onChange={(e) => setCatalogueSearch(e.target.value)}
                      placeholder="Search dental treatments..."
                      className="input-field pl-9" />
                  </div>
                  <button type="button" onClick={() => setShowNewTreatment((v) => !v)}
                    className="rounded-xl border border-clinic-teal px-4 py-3 text-sm font-semibold text-clinic-teal hover:bg-white">
                    + New treatment
                  </button>
                </div>

                {showNewTreatment && (
                  <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                    <input autoFocus value={newTreatmentName} onChange={(e) => setNewTreatmentName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomTreatment() } }}
                      placeholder="Type a treatment not in the catalogue..."
                      className="input-field flex-1" />
                    <button type="button" onClick={addCustomTreatment}
                      className="rounded-xl bg-clinic-teal px-4 py-3 text-sm font-semibold text-white">
                      Save treatment
                    </button>
                  </div>
                )}

                <div className="mt-4 grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
                  {visibleCatalogue.map((item) => (
                    <button key={item.id} type="button" onClick={() => selectCatalogueTreatment(item.name)}
                      className={`rounded-xl border px-4 py-3 text-left text-sm transition hover:border-clinic-teal hover:bg-white ${normalizeName(form.treatmentName) === normalizeName(item.name) ? 'border-clinic-teal bg-white ring-1 ring-clinic-teal' : 'border-clinic-line bg-white/70'}`}>
                      <div className="font-semibold">{item.name}</div>
                      <div className="mt-1 text-xs text-clinic-ink/45">
                        {item.usageCount > 0 ? `${item.usageCount} recorded use${item.usageCount === 1 ? '' : 's'}` : 'Not used yet'}
                      </div>
                    </button>
                  ))}
                </div>
                <p className="mt-3 text-xs text-clinic-ink/45">
                  Treatments are automatically ranked by how often they have been used.
                </p>
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <Field label="Patient" required>
                  <select value={form.patientId} onChange={(e) => setForm((c) => ({ ...c, patientId: e.target.value }))} className="input-field">
                    <option value="">Select patient</option>
                    {patients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </Field>

                <Field label="Selected treatment" required>
                  <input value={form.treatmentName} onChange={(e) => setForm((c) => ({ ...c, treatmentName: e.target.value }))}
                    placeholder="Select from catalogue or type a treatment" className="input-field" maxLength={200} />
                </Field>

                <Field label="Tooth / teeth">
                  <input value={form.tooth} onChange={(e) => setForm((c) => ({ ...c, tooth: e.target.value }))} placeholder="e.g. 16, 17" className="input-field" maxLength={100} />
                </Field>

                <Field label="Diagnosis">
                  <input value={form.diagnosis} onChange={(e) => setForm((c) => ({ ...c, diagnosis: e.target.value }))} placeholder="Clinical diagnosis" className="input-field" maxLength={500} />
                </Field>

                <Field label="Status">
                  <select value={form.status} onChange={(e) => setForm((c) => ({ ...c, status: e.target.value as TreatmentStatus }))} className="input-field">
                    <option>Planned</option>
                    <option>In progress</option>
                    <option>Partially completed</option>
                    <option>Completed</option>
                    <option>On hold</option>
                    <option>Cancelled</option>
                  </select>
                </Field>

                <Field label="Treatment cost" required>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={form.cost}
                    onChange={(e) => setForm((c) => ({ ...c, cost: e.target.value === '' ? '' : Number(e.target.value) }))}
                    placeholder="Enter treatment cost"
                    className="input-field"
                    required
                  />
                </Field>

                <Field label="Planned visits">
                  <input type="number" min="1" max="50" step="1" value={form.plannedVisits} onChange={(e) => setForm((c) => ({ ...c, plannedVisits: Number(e.target.value) }))} className="input-field" />
                </Field>

                <Field label="Completed visits">
                  <input type="number" min="0" max={form.plannedVisits} step="1" value={form.completedVisits} onChange={(e) => setForm((c) => ({ ...c, completedVisits: Number(e.target.value) }))} className="input-field" />
                </Field>

                <Field label="Start date">
                  <input type="date" value={form.startDate} onChange={(e) => setForm((c) => ({ ...c, startDate: e.target.value }))} className="input-field" />
                </Field>

                <Field label="Next visit">
                  <input type="date" value={form.nextVisit} onChange={(e) => setForm((c) => ({ ...c, nextVisit: e.target.value }))} className="input-field" />
                </Field>
              </div>

              {form.treatmentName && (
                <div className="rounded-2xl border border-clinic-teal/20 bg-clinic-teal/5 p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-clinic-teal">Automatic inventory</p>
                      <p className="mt-1 text-sm text-clinic-ink/65">
                        {getInventoryRequirements(form.treatmentName).length
                          ? 'Required inventory will be detected and deducted automatically when this treatment starts.'
                          : 'No inventory rule is configured for this treatment yet.'}
                      </p>
                    </div>
                    <div className="text-right text-xs text-clinic-ink/50">
                      {getInventoryRequirements(form.treatmentName).length
                        ? `${getInventoryRequirements(form.treatmentName).length} inventory rule${getInventoryRequirements(form.treatmentName).length === 1 ? '' : 's'}`
                        : 'Custom treatment'}
                    </div>
                  </div>

                  {inventoryWarnings.length > 0 && (
                    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                      <p className="font-semibold text-amber-800">Inventory warnings</p>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-800">
                        {inventoryWarnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {form.patientId && (
                <div className="rounded-2xl border border-green-200 bg-green-50/60 p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-green-700">WhatsApp update</p>
                      {selectedPatientAppointment ? (
                        <p className="mt-2 text-xs font-medium text-green-700">
                          Appointment: {formatDate(selectedPatientAppointment.date)} at {formatTime(selectedPatientAppointment.time)}
                        </p>
                      ) : (
                        <p className="mt-2 text-xs text-clinic-ink/45">Select a patient with a booked appointment to enable WhatsApp.</p>
                      )}
                      <p className="mt-1 text-xs text-clinic-ink/45">
                        {!editingId
                          ? 'First send: appointment welcome message.'
                          : 'Later sends: only new treatment-status changes.'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const currentTreatment = editingId
                          ? treatments.find((item) => item.id === editingId)
                          : undefined
                        sendTreatmentWhatsApp(currentTreatment)
                      }}
                      disabled={!canSendTreatmentWhatsApp(editingId ? treatments.find((item) => item.id === editingId) : undefined)}
                      className="shrink-0 rounded-xl bg-[#25D366] px-4 py-3 text-sm font-semibold text-white hover:bg-[#20bd5a] disabled:cursor-not-allowed disabled:opacity-40">
                      Send WhatsApp update
                    </button>
                  </div>
                </div>
              )}

              <Field label="Clinical notes">
                <textarea rows={4} value={form.notes} onChange={(e) => setForm((c) => ({ ...c, notes: e.target.value }))}
                  placeholder="Add relevant clinical notes..." maxLength={5000} className="input-field resize-none" />
              </Field>

              <div className="flex justify-end gap-3 border-t border-clinic-line pt-5">
                <button type="button" onClick={closeForm} className="rounded-xl border border-clinic-line px-5 py-3 text-sm font-semibold hover:bg-clinic-paper">Cancel</button>
                <button type="submit" className="rounded-xl bg-clinic-teal px-5 py-3 text-sm font-semibold text-white hover:opacity-90">
                  {editingId ? 'Save Changes' : 'Create Treatment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  )
}

function SummaryCard({ label, value, active, onClick }: {
  label: string
  value: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick}
      className={`rounded-2xl border bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${active ? 'border-clinic-teal ring-1 ring-clinic-teal' : 'border-clinic-line'}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-clinic-ink/40">{label}</p>
      <p className="mt-3 font-display text-3xl font-semibold text-clinic-ink">{value}</p>
      <p className="mt-2 text-xs text-clinic-teal">View records →</p>
    </button>
  )
}

function Field({ label, required, children }: {
  label: string
  required?: boolean
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-clinic-ink">
        {label}{required && <span className="ml-1 text-clinic-clay">*</span>}
      </span>
      {children}
    </label>
  )
}
