import { cloneElement, isValidElement, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { jsPDF } from 'jspdf'

type Patient = {
  id: string
  name: string
}

type Treatment = {
  id: string
  patientId: string
  patientName: string
  treatmentName: string
  tooth: string
  diagnosis?: string
  cost: number
  status: string
  plannedVisits: number
  completedVisits: number
  nextVisit?: string
}

type Appointment = {
  id: string
  patientId: string
  patientName: string
  date: string
  time: string
  reason: string
  status: string
}

type PaymentStatus = 'Unpaid' | 'Partially paid' | 'Paid'

type PaymentMethod =
  | 'Cash'
  | 'UPI'
  | 'Card'
  | 'Bank transfer'
  | 'Other'

type InvoiceItem = {
  id: string
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

const PATIENTS_STORAGE_KEY = 'joshi-dental-clinic-patients'
const TREATMENTS_STORAGE_KEY = 'joshi-dental-clinic-treatments'
const APPOINTMENTS_STORAGE_KEY =
  'joshi-dental-clinic-appointments'
const INVOICES_STORAGE_KEY = 'joshi-dental-clinic-invoices'

const emptyForm = {
  patientId: '',
  treatmentId: '',
  description: '',
  quantity: '1',
  amount: '0',
  discount: '0',
  amountPaid: '0',
  paymentMethod: 'Cash' as PaymentMethod,
  notes: '',
}

const PAYMENT_METHODS: PaymentMethod[] = [
  'Cash',
  'UPI',
  'Card',
  'Bank transfer',
  'Other',
]

const PAYMENT_STATUSES: PaymentStatus[] = [
  'Unpaid',
  'Partially paid',
  'Paid',
]

const MAX_DESCRIPTION_LENGTH = 500
const MAX_NOTES_LENGTH = 2000
const MAX_QUANTITY = 1000
const MAX_MONEY = 100000000

function isNonEmptyString(value: unknown, maxLength = 5000): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= maxLength
  )
}

function isSafeMoney(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= MAX_MONEY
  )
}

function isSafeInteger(value: unknown, minimum: number, maximum: number): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= minimum &&
    value <= maximum
  )
}

function isValidDateString(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return (
    Number.isInteger(year) &&
    Number.isInteger(month) &&
    Number.isInteger(day) &&
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  )
}

function isPaymentStatus(value: unknown): value is PaymentStatus {
  return PAYMENT_STATUSES.includes(value as PaymentStatus)
}

function isPaymentMethod(value: unknown): value is PaymentMethod {
  return PAYMENT_METHODS.includes(value as PaymentMethod)
}

function isValidInvoiceItem(value: unknown): value is InvoiceItem {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<InvoiceItem>
  return (
    isNonEmptyString(item.id, 100) &&
    isNonEmptyString(item.description, MAX_DESCRIPTION_LENGTH) &&
    isSafeInteger(item.quantity, 1, MAX_QUANTITY) &&
    isSafeMoney(item.amount)
  )
}

function isValidInvoice(value: unknown): value is Invoice {
  if (!value || typeof value !== 'object') return false
  const invoice = value as Partial<Invoice>
  if (
    !isNonEmptyString(invoice.id, 100) ||
    !isNonEmptyString(invoice.invoiceNumber, 100) ||
    !isNonEmptyString(invoice.patientId, 100) ||
    !isNonEmptyString(invoice.patientName, 500) ||
    !isValidDateString(invoice.date) ||
    !Array.isArray(invoice.items) ||
    invoice.items.length === 0 ||
    !invoice.items.every(isValidInvoiceItem) ||
    !isSafeMoney(invoice.discount) ||
    !isSafeMoney(invoice.total) ||
    !isSafeMoney(invoice.amountPaid) ||
    !isPaymentStatus(invoice.paymentStatus) ||
    typeof invoice.notes !== 'string' ||
    invoice.notes.length > MAX_NOTES_LENGTH
  ) return false

  if (invoice.paymentMethod !== undefined && !isPaymentMethod(invoice.paymentMethod)) return false

  const subtotal = invoice.items.reduce((sum, item) => sum + item.quantity * item.amount, 0)
  if (!Number.isFinite(subtotal) || invoice.discount > subtotal) return false

  const expectedTotal = Math.max(0, subtotal - invoice.discount)
  if (invoice.total !== expectedTotal || invoice.amountPaid > invoice.total) return false

  const expectedStatus = getPaymentStatus(invoice.total, invoice.amountPaid)
  return invoice.paymentStatus === expectedStatus
}

function loadPatients(): Patient[] {
  try {
    const stored = localStorage.getItem(PATIENTS_STORAGE_KEY)
    if (!stored) return []
    const parsed: unknown = JSON.parse(stored)
    if (!Array.isArray(parsed)) return []
    const seen = new Set<string>()
    return parsed
      .filter((patient): patient is Patient => {
        if (!patient || typeof patient !== 'object') return false
        const item = patient as Partial<Patient>
        if (!isNonEmptyString(item.id, 100) || !isNonEmptyString(item.name, 500) || seen.has(item.id)) return false
        seen.add(item.id)
        return true
      })
      .map((patient) => ({ id: patient.id, name: patient.name.trim() }))
  } catch {
    return []
  }
}

function loadTreatments(): Treatment[] {
  try {
    const stored = localStorage.getItem(TREATMENTS_STORAGE_KEY)
    if (!stored) return []
    const parsed: unknown = JSON.parse(stored)
    if (!Array.isArray(parsed)) return []
    const seen = new Set<string>()
    return parsed.filter((value): value is Treatment => {
      if (!value || typeof value !== 'object') return false
      const item = value as Partial<Treatment>
      if (seen.has(item.id ?? '')) return false
      const valid =
        isNonEmptyString(item.id, 100) &&
        isNonEmptyString(item.patientId, 100) &&
        isNonEmptyString(item.patientName, 500) &&
        isNonEmptyString(item.treatmentName, 500) &&
        typeof item.tooth === 'string' &&
        item.tooth.length <= 100 &&
        isSafeMoney(item.cost) &&
        typeof item.status === 'string' &&
        item.status.length <= 100 &&
        isSafeInteger(item.plannedVisits, 1, 1000) &&
        isSafeInteger(item.completedVisits, 0, item.plannedVisits) &&
        (item.diagnosis === undefined || (typeof item.diagnosis === 'string' && item.diagnosis.length <= 1000)) &&
        (item.nextVisit === undefined || isValidDateString(item.nextVisit))
      if (valid) seen.add(item.id!)
      return valid
    })
  } catch {
    return []
  }
}

function loadAppointments(): Appointment[] {
  try {
    const stored = localStorage.getItem(APPOINTMENTS_STORAGE_KEY)
    if (!stored) return []
    const parsed: unknown = JSON.parse(stored)
    if (!Array.isArray(parsed)) return []
    const seen = new Set<string>()
    return parsed.filter((value): value is Appointment => {
      if (!value || typeof value !== 'object') return false
      const item = value as Partial<Appointment>
      if (seen.has(item.id ?? '')) return false
      const valid =
        isNonEmptyString(item.id, 100) &&
        isNonEmptyString(item.patientId, 100) &&
        isNonEmptyString(item.patientName, 500) &&
        isValidDateString(item.date) &&
        typeof item.time === 'string' && /^\d{2}:\d{2}$/.test(item.time) &&
        isNonEmptyString(item.reason, 500) &&
        typeof item.status === 'string' && item.status.length <= 100
      if (valid) seen.add(item.id!)
      return valid
    })
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
    const seen = new Set<string>()
    return parsed.filter((value): value is Invoice => {
      if (!isValidInvoice(value)) return false
      if (seen.has(value.id)) return false
      seen.add(value.id)
      return true
    })
  } catch {
    return []
  }
}

function formatCurrency(amount: number) {
  return `₹${amount.toLocaleString('en-IN')}`
}

function formatPdfCurrency(amount: number) {
  return `Rs. ${amount.toLocaleString('en-IN')}`
}

function formatDate(date: string) {
  if (!date) return '—'

  const parsed = new Date(`${date}T00:00:00`)

  if (Number.isNaN(parsed.getTime())) return date

  return parsed.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function formatAppointmentDate(
  date: string,
  time: string,
) {
  if (!date) return '—'

  const formattedDate = formatDate(date)

  return time
    ? `${formattedDate} at ${time}`
    : formattedDate
}

function getPaymentStatus(
  total: number,
  amountPaid: number,
): PaymentStatus {
  if (total === 0 && amountPaid === 0) return 'Paid'
  if (amountPaid >= total && total > 0) return 'Paid'

  if (amountPaid > 0) return 'Partially paid'

  return 'Unpaid'
}

function getStatusClasses(status: PaymentStatus) {
  switch (status) {
    case 'Paid':
      return 'bg-clinic-success/10 text-clinic-success'

    case 'Partially paid':
      return 'bg-amber-50 text-amber-700'

    default:
      return 'bg-red-50 text-red-700'
  }
}

function getNextInvoiceNumber(invoices: Invoice[]) {
  const highestNumber = invoices.reduce((highest, invoice) => {
    const match = invoice.invoiceNumber.match(/(\d+)$/)

    if (!match) return highest

    return Math.max(highest, Number(match[1]))
  }, 0)

  return `INV-${String(highestNumber + 1).padStart(4, '0')}`
}

function sanitizeNumberInput(value: string) {
  return value.replace(/[^\d]/g, '')
}

function sanitizeMoneyInput(value: string) {
  const cleaned = value.replace(/[^\d.]/g, '')
  const [whole, ...fraction] = cleaned.split('.')
  return fraction.length > 0 ? `${whole}.${fraction.join('').slice(0, 2)}` : whole
}

function numberValue(value: string) {
  if (value === '') return 0

  const parsed = Number(value)

  return Number.isFinite(parsed) ? parsed : 0
}

function getRemainingVisits(treatments: Treatment[]) {
  return treatments.reduce((total, treatment) => {
    const remaining = Math.max(
      0,
      treatment.plannedVisits - treatment.completedVisits,
    )

    return total + remaining
  }, 0)
}

function getNextAppointment(
  appointments: Appointment[],
  patientId: string,
) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return appointments
    .filter(
      (appointment) =>
        appointment.patientId === patientId &&
        appointment.status !== 'Cancelled' &&
        appointment.status !== 'Completed' &&
        appointment.status !== 'No show',
    )
    .filter((appointment) => {
      const appointmentDate = new Date(
        `${appointment.date}T00:00:00`,
      )

      return appointmentDate >= today
    })
    .sort((a, b) => {
      const first = new Date(
        `${a.date}T${a.time || '00:00'}`,
      ).getTime()

      const second = new Date(
        `${b.date}T${b.time || '00:00'}`,
      ).getTime()

      return first - second
    })[0]
}

function getLocalDateString(): string {
  const today = new Date()

  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function safeFileName(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 100)
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export function BillingPage() {
  const [patients, setPatients] = useState<Patient[]>(
    loadPatients,
  )

  const [treatments, setTreatments] =
    useState<Treatment[]>(loadTreatments)

  const [appointments, setAppointments] =
    useState<Appointment[]>(loadAppointments)

  const [invoices, setInvoices] =
    useState<Invoice[]>(loadInvoices)

  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)

  const [editingInvoiceId, setEditingInvoiceId] =
    useState<string | null>(null)

  const [form, setForm] = useState(emptyForm)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    const refreshData = () => {
      setPatients(loadPatients())
      setTreatments(loadTreatments())
      setAppointments(loadAppointments())
    }

    window.addEventListener('storage', refreshData)

    return () => {
      window.removeEventListener('storage', refreshData)
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(
      INVOICES_STORAGE_KEY,
      JSON.stringify(invoices),
    )
  }, [invoices])

  const filteredInvoices = useMemo(() => {
    const query = search.trim().toLowerCase()

    if (!query) return invoices

    return invoices.filter((invoice) =>
      [
        invoice.invoiceNumber,
        invoice.patientName,
        invoice.paymentStatus,
        invoice.paymentMethod ?? '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(query),
    )
  }, [search, invoices])

  const summary = useMemo(() => {
    const totalBilled = invoices.reduce(
      (total, invoice) => total + invoice.total,
      0,
    )

    const totalPaid = invoices.reduce(
      (total, invoice) => total + invoice.amountPaid,
      0,
    )

    return {
      totalInvoices: invoices.length,
      totalBilled,
      totalPaid,
      outstanding: Math.max(
        0,
        totalBilled - totalPaid,
      ),
    }
  }, [invoices])

  const selectedPatientTreatments = useMemo(() => {
    if (!form.patientId) return []

    return treatments.filter(
      (treatment) =>
        treatment.patientId === form.patientId &&
        treatment.status !== 'Cancelled',
    )
  }, [form.patientId, treatments])

  const quantity = numberValue(form.quantity)
  const amount = numberValue(form.amount)
  const discount = numberValue(form.discount)
  const amountPaid = numberValue(form.amountPaid)

  const invoiceSubtotal = quantity * amount

  const invoiceTotal = Math.max(
    0,
    invoiceSubtotal - discount,
  )

  const outstandingAmount = Math.max(
    0,
    invoiceTotal - amountPaid,
  )

  const currentPaymentStatus = getPaymentStatus(
    invoiceTotal,
    amountPaid,
  )

  function openNewInvoice() {
    setEditingInvoiceId(null)
    setForm({ ...emptyForm })
    setFormError('')
    setShowForm(true)
  }

  function openPayment(invoice: Invoice) {
    const firstItem = invoice.items[0]

    setEditingInvoiceId(invoice.id)

    setForm({
      patientId: invoice.patientId,
      treatmentId: '',
      description: firstItem?.description ?? '',
      quantity: String(firstItem?.quantity ?? 1),
      amount: String(firstItem?.amount ?? 0),
      discount: String(invoice.discount),
      amountPaid: String(invoice.amountPaid),
      paymentMethod: invoice.paymentMethod ?? 'Cash',
      notes: invoice.notes,
    })

    setFormError('')
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingInvoiceId(null)
    setForm(emptyForm)
    setFormError('')
  }

  function handlePatientChange(patientId: string) {
    setForm((current) => ({
      ...current,
      patientId,
      treatmentId: '',
      description: '',
      amount: '0',
    }))
  }

  function handleTreatmentChange(treatmentId: string) {
    const treatment = treatments.find(
      (item) => item.id === treatmentId,
    )

    if (!treatment) {
      setForm((current) => ({
        ...current,
        treatmentId: '',
      }))

      return
    }

    setForm((current) => ({
      ...current,
      treatmentId,
      description: treatment.treatmentName,
      amount: String(treatment.cost),
    }))
  }

  function handleAmountPaidChange(value: string) {
    const sanitized = sanitizeMoneyInput(value)

    if (sanitized === '') {
      setForm((current) => ({
        ...current,
        amountPaid: '',
      }))

      return
    }

    const enteredAmount = Number(sanitized)

    if (enteredAmount > invoiceTotal) {
      setForm((current) => ({
        ...current,
        amountPaid: String(invoiceTotal),
      }))

      return
    }

    setForm((current) => ({
      ...current,
      amountPaid: sanitized,
    }))
  }

  function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault()

    const quantityValue = numberValue(form.quantity)
    const amountValue = numberValue(form.amount)
    const discountValue = numberValue(form.discount)
    const amountPaidValue = numberValue(form.amountPaid)

    const subtotalValue =
      quantityValue * amountValue

    const totalValue = Math.max(
      0,
      subtotalValue - discountValue,
    )

    if (!form.patientId) {
      setFormError('Please select a patient.')
      return
    }

    if (!form.description.trim()) {
      setFormError('Please enter a billing description.')
      return
    }

    if (form.description.length > MAX_DESCRIPTION_LENGTH) {
      setFormError(`Description cannot exceed ${MAX_DESCRIPTION_LENGTH} characters.`)
      return
    }

    if (form.notes.length > MAX_NOTES_LENGTH) {
      setFormError(`Notes cannot exceed ${MAX_NOTES_LENGTH} characters.`)
      return
    }

    if (!Number.isSafeInteger(quantityValue) || quantityValue < 1 || quantityValue > MAX_QUANTITY) {
      setFormError(`Quantity must be a whole number between 1 and ${MAX_QUANTITY}.`)
      return
    }

    if (!Number.isFinite(amountValue) || amountValue < 0 || amountValue > MAX_MONEY) {
      setFormError('Amount is invalid or exceeds the allowed limit.')
      return
    }

    if (!Number.isFinite(discountValue) || discountValue < 0 || discountValue > MAX_MONEY) {
      setFormError('Discount is invalid or exceeds the allowed limit.')
      return
    }

    if (!Number.isFinite(amountPaidValue) || amountPaidValue < 0 || amountPaidValue > MAX_MONEY) {
      setFormError('Amount paid is invalid or exceeds the allowed limit.')
      return
    }

    if (quantityValue < 1) {
      setFormError('Quantity must be at least 1.')
      return
    }

    if (amountValue < 0) {
      setFormError('Amount cannot be negative.')
      return
    }

    if (discountValue < 0) {
      setFormError('Discount cannot be negative.')
      return
    }

    if (discountValue > subtotalValue) {
      setFormError(
        'Discount cannot be greater than the subtotal.',
      )
      return
    }

    if (amountPaidValue < 0) {
      setFormError('Amount paid cannot be negative.')
      return
    }

    if (amountPaidValue > totalValue) {
      setFormError(
        `Amount paid cannot exceed the invoice total of ${formatCurrency(
          totalValue,
        )}.`,
      )
      return
    }

    if (!isPaymentMethod(form.paymentMethod)) {
      setFormError('Please select a valid payment method.')
      return
    }

    const patient = patients.find(
      (item) => item.id === form.patientId,
    )

    if (!patient) {
      setFormError(
        'The selected patient could not be found.',
      )
      return
    }

    const paymentStatus = getPaymentStatus(
      totalValue,
      amountPaidValue,
    )

    if (editingInvoiceId) {
      const existingInvoice = invoices.find((invoice) => invoice.id === editingInvoiceId)

      if (!existingInvoice) {
        setFormError('This invoice could not be found. Please close and try again.')
        return
      }

      setInvoices((current) =>
        current.map((invoice) => {
          if (invoice.id !== editingInvoiceId) {
            return invoice
          }

          return {
            ...invoice,
            patientId: patient.id,
            patientName: patient.name,
            items: [
              {
                id:
                  invoice.items[0]?.id ??
                  crypto.randomUUID(),
                description: form.description.trim(),
                quantity: quantityValue,
                amount: amountValue,
              },
            ],
            discount: discountValue,
            total: totalValue,
            amountPaid: amountPaidValue,
            paymentStatus,
            paymentMethod:
              amountPaidValue > 0
                ? form.paymentMethod
                : undefined,
            notes: form.notes.trim(),
          }
        }),
      )

      closeForm()
      return
    }

    const newInvoice: Invoice = {
      id: crypto.randomUUID(),
      invoiceNumber: getNextInvoiceNumber(invoices),
      patientId: patient.id,
      patientName: patient.name,
      date: getLocalDateString(),
      items: [
        {
          id: crypto.randomUUID(),
          description: form.description.trim(),
          quantity: quantityValue,
          amount: amountValue,
        },
      ],
      discount: discountValue,
      total: totalValue,
      amountPaid: amountPaidValue,
      paymentStatus,
      paymentMethod:
        amountPaidValue > 0
          ? form.paymentMethod
          : undefined,
      notes: form.notes.trim(),
    }

    setInvoices((current) => [
      newInvoice,
      ...current,
    ])

    closeForm()
  }

  function deleteInvoice(id: string) {
    const confirmed = window.confirm(
      'Delete this invoice? This action cannot be undone.',
    )

    if (!confirmed) return

    setInvoices((current) =>
      current.filter((invoice) => invoice.id !== id),
    )
  }

  function createBillPdf(invoice: Invoice) {
    const doc = new jsPDF()

    const patientTreatments = treatments.filter(
      (treatment) =>
        treatment.patientId === invoice.patientId &&
        treatment.status !== 'Cancelled',
    )

    const nextAppointment = getNextAppointment(
      appointments,
      invoice.patientId,
    )

    const remainingVisits =
      getRemainingVisits(patientTreatments)

    const pageWidth = doc.internal.pageSize.getWidth()
    const margin = 18

    let y = 22

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(20)
    doc.text('JOSHI DENTAL CLINIC', pageWidth / 2, y, {
      align: 'center',
    })

    y += 8

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    doc.text('Dr. Joe', pageWidth / 2, y, {
      align: 'center',
    })

    y += 10

    doc.setDrawColor(220, 225, 223)
    doc.line(margin, y, pageWidth - margin, y)

    y += 12

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.text('BILL / INVOICE', margin, y)

    y += 9

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)

    doc.text(
      `Invoice Number: ${invoice.invoiceNumber}`,
      margin,
      y,
    )

    doc.text(
      `Date: ${formatDate(invoice.date)}`,
      pageWidth - margin,
      y,
      { align: 'right' },
    )

    y += 14

    doc.setFont('helvetica', 'bold')
    doc.text('PATIENT DETAILS', margin, y)

    y += 7

    doc.setFont('helvetica', 'normal')
    doc.text(
      `Patient Name: ${invoice.patientName}`,
      margin,
      y,
    )

    y += 12

    doc.setFont('helvetica', 'bold')
    doc.text('TREATMENT', margin, y)

    y += 7

    doc.setFont('helvetica', 'normal')

    invoice.items.forEach((item) => {
      const itemTotal =
        item.quantity * item.amount

      doc.text(
        `${item.description} × ${item.quantity}`,
        margin,
        y,
      )

      doc.text(
        formatPdfCurrency(itemTotal),
        pageWidth - margin,
        y,
        { align: 'right' },
      )

      y += 6
    })

    if (patientTreatments.length > 0) {
      y += 5

      doc.setFont('helvetica', 'bold')
      doc.text('Treatment Details', margin, y)

      y += 7

      doc.setFont('helvetica', 'normal')

      patientTreatments.forEach((treatment) => {
        const treatmentText =
          treatment.tooth
            ? `${treatment.treatmentName} — Tooth ${treatment.tooth}`
            : treatment.treatmentName

        doc.text(
          treatmentText,
          margin,
          y,
        )

        y += 5

        if (treatment.diagnosis) {
          doc.text(
            `Diagnosis: ${treatment.diagnosis}`,
            margin + 4,
            y,
          )

          y += 5
        }

        doc.text(
          `Visits: ${treatment.completedVisits}/${treatment.plannedVisits} completed`,
          margin + 4,
          y,
        )

        y += 7
      })
    }

    y += 4

    doc.setDrawColor(220, 225, 223)
    doc.line(margin, y, pageWidth - margin, y)

    y += 9

    doc.setFont('helvetica', 'normal')

    doc.text('Subtotal', margin, y)

    doc.text(
      formatPdfCurrency(
        invoice.items.reduce(
          (sum, item) =>
            sum + item.quantity * item.amount,
          0,
        ),
      ),
      pageWidth - margin,
      y,
      { align: 'right' },
    )

    y += 7

    doc.text('Discount', margin, y)

    doc.text(
      `- ${formatPdfCurrency(invoice.discount)}`,
      pageWidth - margin,
      y,
      { align: 'right' },
    )

    y += 9

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)

    doc.text('Invoice Total', margin, y)

    doc.text(
      formatPdfCurrency(invoice.total),
      pageWidth - margin,
      y,
      { align: 'right' },
    )

    y += 9

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)

    doc.text('Amount Paid', margin, y)

    doc.text(
      formatPdfCurrency(invoice.amountPaid),
      pageWidth - margin,
      y,
      { align: 'right' },
    )

    y += 7

    doc.text('Remaining Balance', margin, y)

    doc.text(
      formatPdfCurrency(
        Math.max(
          0,
          invoice.total - invoice.amountPaid,
        ),
      ),
      pageWidth - margin,
      y,
      { align: 'right' },
    )

    y += 12

    doc.setFont('helvetica', 'bold')
    doc.text('PAYMENT STATUS', margin, y)

    doc.text(
      invoice.paymentStatus,
      pageWidth - margin,
      y,
      { align: 'right' },
    )

    y += 7

    if (invoice.paymentMethod) {
      doc.setFont('helvetica', 'normal')

      doc.text(
        'Payment Method',
        margin,
        y,
      )

      doc.text(
        invoice.paymentMethod,
        pageWidth - margin,
        y,
        { align: 'right' },
      )

      y += 10
    } else {
      y += 6
    }

    doc.setDrawColor(220, 225, 223)
    doc.line(margin, y, pageWidth - margin, y)

    y += 10

    doc.setFont('helvetica', 'bold')
    doc.text('FOLLOW-UP INFORMATION', margin, y)

    y += 8

    doc.setFont('helvetica', 'normal')

    doc.text(
      'Next Scheduled Meeting',
      margin,
      y,
    )

    doc.text(
      nextAppointment
        ? formatAppointmentDate(
            nextAppointment.date,
            nextAppointment.time,
          )
        : 'Not scheduled',
      pageWidth - margin,
      y,
      { align: 'right' },
    )

    y += 8

    doc.text(
      'Remaining Treatment Visits',
      margin,
      y,
    )

    doc.text(
      String(remainingVisits),
      pageWidth - margin,
      y,
      { align: 'right' },
    )

    if (invoice.notes) {
      y += 12

      doc.setFont('helvetica', 'bold')
      doc.text('NOTES', margin, y)

      y += 7

      doc.setFont('helvetica', 'normal')

      const noteLines = doc.splitTextToSize(
        invoice.notes,
        pageWidth - margin * 2,
      )

      doc.text(noteLines, margin, y)

      y += noteLines.length * 5
    }

    y += 14

    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100)

    doc.text(
      'Thank you for choosing JOSHI DENTAL CLINIC.',
      pageWidth / 2,
      y,
      { align: 'center' },
    )

    doc.save(
      `${safeFileName(invoice.invoiceNumber)}-${safeFileName(invoice.patientName)}.pdf`,
    )
  }

  function printBill(invoice: Invoice) {
    const patientTreatments = treatments.filter(
      (treatment) =>
        treatment.patientId === invoice.patientId &&
        treatment.status !== 'Cancelled',
    )

    const nextAppointment = getNextAppointment(
      appointments,
      invoice.patientId,
    )

    const remainingVisits =
      getRemainingVisits(patientTreatments)

    const balance = Math.max(
      0,
      invoice.total - invoice.amountPaid,
    )

    const treatmentRows = invoice.items
      .map(
        (item) => `
          <tr>
            <td>${escapeHtml(item.description)}</td>
            <td>${item.quantity}</td>
            <td>₹${(
              item.quantity * item.amount
            ).toLocaleString('en-IN')}</td>
          </tr>
        `,
      )
      .join('')

    const printWindow = window.open(
      '',
      '_blank',
      'width=900,height=700',
    )

    if (!printWindow) {
      window.alert(
        'Please allow pop-ups in your browser to print the bill.',
      )

      return
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${invoice.invoiceNumber} - JOSHI DENTAL CLINIC</title>

          <style>
            body {
              font-family: Arial, sans-serif;
              max-width: 800px;
              margin: 40px auto;
              padding: 0 30px;
              color: #14231F;
            }

            .header {
              text-align: center;
              border-bottom: 2px solid #0B5148;
              padding-bottom: 18px;
              margin-bottom: 25px;
            }

            .clinic {
              font-family: Georgia, serif;
              font-size: 28px;
              font-weight: bold;
              color: #0B5148;
            }

            .doctor {
              margin-top: 5px;
              color: #555;
            }

            .invoice-title {
              font-size: 22px;
              font-weight: bold;
              margin-bottom: 20px;
            }

            .info-grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 12px;
              margin-bottom: 25px;
            }

            .box {
              border: 1px solid #ddd;
              padding: 12px;
              border-radius: 8px;
            }

            .label {
              color: #777;
              font-size: 12px;
              margin-bottom: 5px;
            }

            .value {
              font-weight: bold;
            }

            h3 {
              margin-top: 25px;
              border-bottom: 1px solid #ddd;
              padding-bottom: 7px;
            }

            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 12px;
            }

            th, td {
              border-bottom: 1px solid #ddd;
              padding: 10px 5px;
              text-align: left;
            }

            th:last-child,
            td:last-child {
              text-align: right;
            }

            .totals {
              margin-left: auto;
              width: 300px;
              margin-top: 20px;
            }

            .total-row {
              display: flex;
              justify-content: space-between;
              padding: 7px 0;
            }

            .grand-total {
              border-top: 2px solid #0B5148;
              font-size: 18px;
              font-weight: bold;
              padding-top: 10px;
            }

            .status {
              font-weight: bold;
              padding: 8px 12px;
              border-radius: 20px;
              display: inline-block;
              margin-top: 8px;
            }

            .paid {
              color: #2F7A5C;
              background: #eef7f2;
            }

            .partial {
              color: #9a6700;
              background: #fff7df;
            }

            .unpaid {
              color: #b42318;
              background: #fff0ef;
            }

            .footer {
              margin-top: 45px;
              text-align: center;
              color: #777;
              font-size: 12px;
            }

            @media print {
              body {
                margin: 0;
                padding: 20px;
              }
            }
          </style>
        </head>

        <body>
          <div class="header">
            <div class="clinic">
              JOSHI DENTAL CLINIC
            </div>

            <div class="doctor">
              Dr. Joe
            </div>
          </div>

          <div class="invoice-title">
            BILL / INVOICE
          </div>

          <div class="info-grid">
            <div class="box">
              <div class="label">
                Invoice Number
              </div>

              <div class="value">
                ${invoice.invoiceNumber}
              </div>
            </div>

            <div class="box">
              <div class="label">
                Date
              </div>

              <div class="value">
                ${formatDate(invoice.date)}
              </div>
            </div>

            <div class="box">
              <div class="label">
                Patient
              </div>

              <div class="value">
                ${invoice.patientName}
              </div>
            </div>

            <div class="box">
              <div class="label">
                Payment Method
              </div>

              <div class="value">
                ${invoice.paymentMethod ?? 'Not recorded'}
              </div>
            </div>
          </div>

          <h3>Treatment Made</h3>

          <table>
            <thead>
              <tr>
                <th>Treatment</th>
                <th>Qty</th>
                <th>Amount</th>
              </tr>
            </thead>

            <tbody>
              ${treatmentRows}
            </tbody>
          </table>

          <div class="totals">
            <div class="total-row">
              <span>Subtotal</span>
              <span>
                ₹${invoice.items
                  .reduce(
                    (sum, item) =>
                      sum +
                      item.quantity * item.amount,
                    0,
                  )
                  .toLocaleString('en-IN')}
              </span>
            </div>

            <div class="total-row">
              <span>Discount</span>
              <span>
                - ₹${invoice.discount.toLocaleString(
                  'en-IN',
                )}
              </span>
            </div>

            <div class="total-row grand-total">
              <span>Total</span>
              <span>
                ₹${invoice.total.toLocaleString(
                  'en-IN',
                )}
              </span>
            </div>

            <div class="total-row">
              <span>Amount Paid</span>
              <span>
                ₹${invoice.amountPaid.toLocaleString(
                  'en-IN',
                )}
              </span>
            </div>

            <div class="total-row">
              <span>Remaining Balance</span>
              <span>
                ₹${balance.toLocaleString('en-IN')}
              </span>
            </div>
          </div>

          <h3>Payment Status</h3>

          <div>
            <span class="status ${
              invoice.paymentStatus === 'Paid'
                ? 'paid'
                : invoice.paymentStatus ===
                    'Partially paid'
                  ? 'partial'
                  : 'unpaid'
            }">
              ${invoice.paymentStatus}
            </span>
          </div>

          <h3>Follow-up Information</h3>

          <div class="info-grid">
            <div class="box">
              <div class="label">
                Next Scheduled Meeting
              </div>

              <div class="value">
                ${
                  nextAppointment
                    ? formatAppointmentDate(
                        nextAppointment.date,
                        nextAppointment.time,
                      )
                    : 'Not scheduled'
                }
              </div>
            </div>

            <div class="box">
              <div class="label">
                Remaining Treatment Visits
              </div>

              <div class="value">
                ${remainingVisits}
              </div>
            </div>
          </div>

          ${
            patientTreatments.length > 0
              ? `
                <h3>Treatment Progress</h3>

                ${patientTreatments
                  .map(
                    (treatment) => `
                      <div style="margin-bottom: 10px;">
                        <strong>
                          ${treatment.treatmentName}
                        </strong>

                        <br />

                        <span>
                          ${treatment.completedVisits}
                          /
                          ${treatment.plannedVisits}
                          visits completed
                        </span>
                      </div>
                    `,
                  )
                  .join('')}
              `
              : ''
          }

          ${
            invoice.notes
              ? `
                <h3>Notes</h3>

                <p>
                  ${escapeHtml(invoice.notes)}
                </p>
              `
              : ''
          }

          <div class="footer">
            Thank you for choosing
            JOSHI DENTAL CLINIC.
          </div>

          <script>
            window.onload = function () {
              window.print()

              window.onafterprint = function () {
                window.close()
              }
            }
          </script>
        </body>
      </html>
    `)

    printWindow.document.close()
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-medium text-clinic-teal">
            Finance
          </p>

          <h1 className="mt-1 font-display text-4xl font-semibold text-clinic-ink">
            Billing
          </h1>

          <p className="mt-2 text-sm text-clinic-ink/60">
            Create invoices, record payments, and track outstanding balances.
          </p>
        </div>

        <button
          type="button"
          onClick={openNewInvoice}
          className="rounded-xl bg-clinic-teal px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90"
        >
          + New Invoice
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Total invoices"
          value={String(summary.totalInvoices)}
        />

        <SummaryCard
          label="Total billed"
          value={formatCurrency(summary.totalBilled)}
        />

        <SummaryCard
          label="Total received"
          value={formatCurrency(summary.totalPaid)}
        />

        <SummaryCard
          label="Outstanding"
          value={formatCurrency(summary.outstanding)}
        />
      </div>

      <div className="rounded-2xl border border-clinic-line bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-display text-xl font-semibold">
              Invoices
            </h2>

            <p className="mt-1 text-sm text-clinic-ink/50">
              Search and manage patient invoices.
            </p>
          </div>

          <input
            type="search"
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
            placeholder="Search invoices..."
            className="w-full rounded-xl border border-clinic-line bg-clinic-paper px-4 py-3 text-sm outline-none transition focus:border-clinic-teal md:w-80"
          />
        </div>

        <div className="mt-5 overflow-x-auto">
          {filteredInvoices.length === 0 ? (
            <div className="rounded-xl border border-dashed border-clinic-line bg-clinic-paper p-10 text-center">
              <h3 className="font-semibold text-clinic-ink">
                {search
                  ? 'No invoices found'
                  : 'No invoices yet'}
              </h3>

              <p className="mt-2 text-sm text-clinic-ink/50">
                {search
                  ? 'Try a different search term.'
                  : 'Create an invoice to start tracking clinic payments.'}
              </p>

              {!search && (
                <button
                  type="button"
                  onClick={openNewInvoice}
                  className="mt-5 rounded-xl bg-clinic-teal px-4 py-2.5 text-sm font-semibold text-white"
                >
                  Create first invoice
                </button>
              )}
            </div>
          ) : (
            <table className="w-full min-w-[1100px] text-left">
              <thead>
                <tr className="border-b border-clinic-line text-xs uppercase tracking-wide text-clinic-ink/40">
                  <th className="px-4 py-3 font-semibold">
                    Invoice
                  </th>

                  <th className="px-4 py-3 font-semibold">
                    Patient
                  </th>

                  <th className="px-4 py-3 font-semibold">
                    Date
                  </th>

                  <th className="px-4 py-3 font-semibold">
                    Total
                  </th>

                  <th className="px-4 py-3 font-semibold">
                    Paid
                  </th>

                  <th className="px-4 py-3 font-semibold">
                    Balance
                  </th>

                  <th className="px-4 py-3 font-semibold">
                    Status
                  </th>

                  <th className="px-4 py-3 text-right font-semibold">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody>
                {filteredInvoices.map((invoice) => {
                  const balance = Math.max(
                    0,
                    invoice.total - invoice.amountPaid,
                  )

                  return (
                    <tr
                      key={invoice.id}
                      className="border-b border-clinic-line/70 last:border-0"
                    >
                      <td className="px-4 py-4 text-sm font-semibold">
                        {invoice.invoiceNumber}
                      </td>

                      <td className="px-4 py-4 text-sm">
                        {invoice.patientName}
                      </td>

                      <td className="px-4 py-4 text-sm text-clinic-ink/60">
                        {formatDate(invoice.date)}
                      </td>

                      <td className="px-4 py-4 text-sm font-medium">
                        {formatCurrency(invoice.total)}
                      </td>

                      <td className="px-4 py-4 text-sm text-clinic-success">
                        {formatCurrency(invoice.amountPaid)}
                      </td>

                      <td className="px-4 py-4 text-sm font-semibold">
                        {formatCurrency(balance)}
                      </td>

                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getStatusClasses(
                            invoice.paymentStatus,
                          )}`}
                        >
                          {invoice.paymentStatus}
                        </span>
                      </td>

                      <td className="px-4 py-4">
                        <div className="flex justify-end gap-2">
                          {invoice.paymentStatus !==
                            'Paid' && (
                            <button
                              type="button"
                              onClick={() =>
                                openPayment(invoice)
                              }
                              className="rounded-lg bg-clinic-teal px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
                            >
                              Record Payment
                            </button>
                          )}

                          {invoice.paymentStatus ===
                            'Paid' && (
                            <button
                              type="button"
                              onClick={() =>
                                openPayment(invoice)
                              }
                              className="rounded-lg border border-clinic-line px-3 py-2 text-xs font-semibold text-clinic-teal hover:bg-clinic-paper"
                            >
                              View Payment
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() =>
                              createBillPdf(invoice)
                            }
                            className="rounded-lg border border-clinic-line px-3 py-2 text-xs font-semibold text-clinic-ink/70 hover:bg-clinic-paper"
                          >
                            PDF
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              printBill(invoice)
                            }
                            className="rounded-lg border border-clinic-line px-3 py-2 text-xs font-semibold text-clinic-ink/70 hover:bg-clinic-paper"
                          >
                            Print
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              deleteInvoice(invoice.id)
                            }
                            className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"
                          >
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

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-clinic-line px-6 py-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-clinic-teal">
                  {editingInvoiceId
                    ? 'Payment management'
                    : 'Billing'}
                </p>

                <h2 className="mt-1 font-display text-2xl font-semibold">
                  {editingInvoiceId
                    ? 'Update Payment'
                    : 'New Invoice'}
                </h2>

                <p className="mt-1 text-sm text-clinic-ink/50">
                  {editingInvoiceId
                    ? 'Update the amount received and payment method for this invoice.'
                    : 'Create a patient invoice and record the payment.'}
                </p>
              </div>

              <button
                type="button"
                onClick={closeForm}
                className="rounded-lg px-3 py-2 text-xl text-clinic-ink/50 hover:bg-clinic-paper"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <form
              onSubmit={handleSubmit}
              className="space-y-6 p-6"
            >
              {formError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {formError}
                </div>
              )}

              {editingInvoiceId && (
                <div className="flex flex-col gap-3 rounded-2xl border border-clinic-line bg-clinic-paper p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-clinic-ink/40">
                      Invoice
                    </p>

                    <p className="mt-1 text-lg font-semibold text-clinic-teal">
                      {invoices.find(
                        (invoice) =>
                          invoice.id ===
                          editingInvoiceId,
                      )?.invoiceNumber ?? ''}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs uppercase tracking-wide text-clinic-ink/40">
                      Invoice total
                    </p>

                    <p className="mt-1 text-lg font-semibold">
                      {formatCurrency(invoiceTotal)}
                    </p>
                  </div>
                </div>
              )}

              {!editingInvoiceId && (
                <>
                  <div className="grid gap-5 md:grid-cols-2">
                    <Field label="Patient" required>
                      <select
                        value={form.patientId}
                        onChange={(event) =>
                          handlePatientChange(
                            event.target.value,
                          )
                        }
                        className="input-field"
                      >
                        <option value="">
                          Select patient
                        </option>

                        {patients.map((patient) => (
                          <option
                            key={patient.id}
                            value={patient.id}
                          >
                            {patient.name}
                          </option>
                        ))}
                      </select>

                      {patients.length === 0 && (
                        <p className="mt-2 text-xs text-amber-700">
                          Add a patient first before creating an invoice.
                        </p>
                      )}
                    </Field>

                    <Field label="Treatment">
                      <select
                        value={form.treatmentId}
                        onChange={(event) =>
                          handleTreatmentChange(
                            event.target.value,
                          )
                        }
                        disabled={!form.patientId}
                        className="input-field disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <option value="">
                          {form.patientId
                            ? 'Select treatment'
                            : 'Select patient first'}
                        </option>

                        {selectedPatientTreatments.map(
                          (treatment) => (
                            <option
                              key={treatment.id}
                              value={treatment.id}
                            >
                              {treatment.treatmentName} —{' '}
                              {formatCurrency(
                                treatment.cost,
                              )}
                            </option>
                          ),
                        )}
                      </select>
                    </Field>

                    <Field
                      label="Description"
                      required
                    >
                      <input
                        type="text"
                        value={form.description}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            description:
                              event.target.value,
                          }))
                        }
                        placeholder="e.g. Root Canal Treatment"
                        maxLength={MAX_DESCRIPTION_LENGTH}
                        className="input-field"
                      />
                    </Field>

                    <Field label="Quantity">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={form.quantity}
                        onFocus={(event) =>
                          event.currentTarget.select()
                        }
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            quantity:
                              sanitizeNumberInput(
                                event.target.value,
                              ),
                          }))
                        }
                        maxLength={4}
                        className="input-field"
                      />
                    </Field>

                    <Field label="Amount">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={form.amount}
                        onFocus={(event) =>
                          event.currentTarget.select()
                        }
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            amount:
                              sanitizeMoneyInput(
                                event.target.value,
                              ),
                          }))
                        }
                        maxLength={14}
                        className="input-field"
                      />
                    </Field>

                    <Field label="Discount">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={form.discount}
                        onFocus={(event) =>
                          event.currentTarget.select()
                        }
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            discount:
                              sanitizeMoneyInput(
                                event.target.value,
                              ),
                          }))
                        }
                        maxLength={14}
                        className="input-field"
                      />
                    </Field>
                  </div>

                  <div className="rounded-2xl bg-clinic-paper p-5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-clinic-ink/60">
                        Subtotal
                      </span>

                      <span className="font-medium">
                        {formatCurrency(
                          invoiceSubtotal,
                        )}
                      </span>
                    </div>

                    <div className="mt-2 flex items-center justify-between text-sm">
                      <span className="text-clinic-ink/60">
                        Discount
                      </span>

                      <span className="font-medium">
                        − {formatCurrency(discount)}
                      </span>
                    </div>

                    <div className="mt-4 flex items-center justify-between border-t border-clinic-line pt-4">
                      <span className="font-semibold">
                        Invoice total
                      </span>

                      <span className="font-display text-2xl font-semibold text-clinic-teal">
                        {formatCurrency(invoiceTotal)}
                      </span>
                    </div>
                  </div>
                </>
              )}

              {editingInvoiceId && (
                <div className="rounded-2xl border border-clinic-line bg-white p-5">
                  <Field label="Patient">
                    <p className="input-field bg-clinic-paper">
                      {patients.find(
                        (patient) => patient.id === form.patientId,
                      )?.name ?? 'Unknown patient'}
                    </p>
                  </Field>

                  <div className="mt-5">
                    <Field label="Treatment / Description">
                      <input
                        type="text"
                        value={form.description}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            description:
                              event.target.value,
                          }))
                        }
                        className="input-field"
                      />
                    </Field>
                  </div>
                </div>
              )}

              <div className="rounded-2xl border border-clinic-line bg-clinic-paper p-5">
                <div className="mb-5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-clinic-teal">
                    Payment
                  </p>

                  <h3 className="mt-1 font-display text-xl font-semibold">
                    Record payment
                  </h3>

                  <p className="mt-1 text-sm text-clinic-ink/50">
                    Enter the amount actually received from the patient.
                  </p>
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  <Field label="Amount paid">
                    <div className="relative">
                      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-medium text-clinic-ink/40">
                        ₹
                      </span>

                      <input
                        type="text"
                        inputMode="numeric"
                        value={form.amountPaid}
                        onFocus={(event) =>
                          event.currentTarget.select()
                        }
                        onChange={(event) =>
                          handleAmountPaidChange(
                            event.target.value,
                          )
                        }
                        placeholder="0"
                        maxLength={14}
                        className="input-field pl-9"
                      />
                    </div>

                    <p className="mt-2 text-xs text-clinic-ink/45">
                      Maximum allowed:{' '}
                      <span className="font-semibold text-clinic-ink/70">
                        {formatCurrency(invoiceTotal)}
                      </span>
                    </p>
                  </Field>

                  <Field label="Payment method">
                    <select
                      value={form.paymentMethod}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          paymentMethod:
                            event.target
                              .value as PaymentMethod,
                        }))
                      }
                      className="input-field"
                    >
                      <option value="Cash">
                        Cash
                      </option>

                      <option value="UPI">
                        UPI
                      </option>

                      <option value="Card">
                        Card
                      </option>

                      <option value="Bank transfer">
                        Bank transfer
                      </option>

                      <option value="Other">
                        Other
                      </option>
                    </select>
                  </Field>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <PaymentInfo
                    label="Invoice total"
                    value={formatCurrency(
                      invoiceTotal,
                    )}
                  />

                  <PaymentInfo
                    label="Amount received"
                    value={formatCurrency(
                      amountPaid,
                    )}
                  />

                  <PaymentInfo
                    label="Balance due"
                    value={formatCurrency(
                      outstandingAmount,
                    )}
                    emphasis
                  />
                </div>

                <div className="mt-5 flex items-center justify-between rounded-xl border border-clinic-line bg-white px-4 py-4">
                  <span className="text-sm font-medium text-clinic-ink/60">
                    Payment status
                  </span>

                  <span
                    className={`rounded-full px-4 py-1.5 text-xs font-semibold ${getStatusClasses(
                      currentPaymentStatus,
                    )}`}
                  >
                    {currentPaymentStatus}
                  </span>
                </div>
              </div>

              <Field label="Notes">
                <textarea
                  rows={3}
                  value={form.notes}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                  placeholder="Optional billing notes..."
                  maxLength={MAX_NOTES_LENGTH}
                  className="input-field resize-none"
                />
              </Field>

              <div className="flex flex-col-reverse gap-3 border-t border-clinic-line pt-5 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeForm}
                  className="rounded-xl border border-clinic-line px-5 py-3 text-sm font-semibold hover:bg-clinic-paper"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="rounded-xl bg-clinic-teal px-6 py-3 text-sm font-semibold text-white hover:opacity-90"
                >
                  {editingInvoiceId
                    ? 'Save Payment'
                    : 'Create Invoice'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  )
}

function PaymentInfo({
  label,
  value,
  emphasis,
}: {
  label: string
  value: string
  emphasis?: boolean
}) {
  return (
    <div className="rounded-xl border border-clinic-line bg-white p-4">
      <p className="text-xs text-clinic-ink/45">
        {label}
      </p>

      <p
        className={`mt-2 font-semibold ${
          emphasis
            ? 'text-clinic-clay'
            : 'text-clinic-ink'
        }`}
      >
        {value}
      </p>
    </div>
  )
}

function SummaryCard({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="rounded-2xl border border-clinic-line bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-clinic-ink/40">
        {label}
      </p>

      <p className="mt-3 font-display text-3xl font-semibold text-clinic-ink">
        {value}
      </p>
    </div>
  )
}

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  const fieldId = `billing-${label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}`

  const fieldControl = isValidElement(children)
    ? cloneElement(
        children as React.ReactElement<{ id?: string }>,
        { id: fieldId },
      )
    : children

  return (
    <label htmlFor={fieldId} className="block">
      <span className="mb-2 block text-sm font-medium text-clinic-ink">
        {label}

        {required && (
          <span className="ml-1 text-clinic-clay">
            *
          </span>
        )}
      </span>

      {fieldControl}
    </label>
  )
}