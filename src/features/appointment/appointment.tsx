import { useEffect } from 'react'
import { useMemo, useState } from 'react'
import { CalendarDays, CalendarClock, Clock, Search, X } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { getWhatsAppUrl } from '../../lib/whatsapp'

type AppointmentStatus =
  | 'Scheduled'
  | 'Under treatment'
  | 'Completed'
  | 'Cancelled'
  | 'No show'

type AppointmentScope = 'day' | 'all'

type Appointment = {
  id: string
  patientId: string
  patientName: string
  date: string
  time: string
  reason: string
  status: AppointmentStatus
  notes: string
  disease?: string
  requiredVisits?: string
  plannedTreatments?: string
  actionReason?: string
  treatmentDetails?: string
  revisitDate?: string
  rescheduleDate?: string
  rescheduleTime?: string
}

type Patient = {
  id: string
  name: string
  phone: string
}

const PATIENTS_STORAGE_KEY = 'joshi-dental-clinic-patients'
const APPOINTMENTS_STORAGE_KEY = 'joshi-dental-clinic-appointments'

function getLocalDateString() {
  const today = new Date()
  const year = today.getFullYear()
  const month = (today.getMonth() + 1).toString().padStart(2, '0')
  const day = today.getDate().toString().padStart(2, '0')

  return `${year}-${month}-${day}`
}

function isAppointmentStatus(value: unknown): value is AppointmentStatus {
  return typeof value === 'string' && appointmentStatuses.includes(value as AppointmentStatus)
}

function isValidDateString(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false

  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)

  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  )
}

function isValidTimeString(value: unknown): value is string {
  return typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)
}

function isSafeInteger(value: unknown, minimum: number, maximum: number): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= minimum &&
    value <= maximum
  )
}

const emptyAppointment = {
  patientId: '',
  date: getLocalDateString(),
  time: '09:00',
  reason: '',
  status: 'Scheduled' as AppointmentStatus,
  notes: '',
  disease: '',
  requiredVisits: '1',
  plannedTreatments: '',
}

const emptyStatusAction = {
  reason: '',
  treatmentDetails: '',
  revisitDate: '',
  rescheduleDate: '',
  rescheduleTime: '',
}

const appointmentStatuses: AppointmentStatus[] = [
  'Scheduled',
  'Under treatment',
  'Completed',
  'Cancelled',
  'No show',
]

const clinicSchedule = {
  slotIntervalMinutes: 30,
  morning: { start: 10 * 60, end: 15 * 60 },
  evening: { start: 17 * 60, end: 22 * 60 },
}

type AppointmentSlot = {
  value: string
  label: string
  available: boolean
}

function formatDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function getToday() {
  return getLocalDateString()
}

function isSunday(date: string) {
  return new Date(`${date}T00:00:00`).getDay() === 0
}

function formatTimeLabel(minutes: number) {
  const hour = Math.floor(minutes / 60)
  const minute = minutes % 60
  const period = hour >= 12 ? 'PM' : 'AM'
  const displayHour = hour % 12 || 12

  return `${displayHour}:${minute.toString().padStart(2, '0')} ${period}`
}

function getTimeValue(minutes: number) {
  return `${Math.floor(minutes / 60).toString().padStart(2, '0')}:${(minutes % 60)
    .toString()
    .padStart(2, '0')}`
}

function getScheduleSlots(start: number, end: number): Omit<AppointmentSlot, 'available'>[] {
  const slots: Omit<AppointmentSlot, 'available'>[] = []

  for (
    let minutes = start;
    minutes < end;
    minutes += clinicSchedule.slotIntervalMinutes
  ) {
    slots.push({
      value: getTimeValue(minutes),
      label: formatTimeLabel(minutes),
    })
  }

  return slots
}

function getDaySlots(
  date: string,
  appointments: Appointment[],
  editingId: string | null,
) {
  if (isSunday(date)) return []

  if (!editingId && date < getToday()) return []

  const editingAppointment = editingId
    ? appointments.find((appointment) => appointment.id === editingId)
    : null
  const ownSlotValue =
    editingAppointment && editingAppointment.date === date
      ? editingAppointment.time
      : null

  const occupiedTimes = new Set(
    appointments
      .filter(
        (appointment) =>
          appointment.id !== editingId &&
          appointment.date === date &&
          occupiesTimeSlot(appointment.status),
      )
      .map((appointment) => appointment.time),
  )

  // A rescheduled appointment must also reserve its new slot.
  appointments.forEach((appointment) => {
    if (appointment.id === editingId) return
    if (appointment.rescheduleDate !== date || !appointment.rescheduleTime) return
    occupiedTimes.add(appointment.rescheduleTime)
  })

  const isToday = date === getToday()
  const nowMinutes = isToday
    ? new Date().getHours() * 60 + new Date().getMinutes()
    : -1

  return [
    ...getScheduleSlots(clinicSchedule.morning.start, clinicSchedule.morning.end),
    ...getScheduleSlots(clinicSchedule.evening.start, clinicSchedule.evening.end),
  ].map((slot) => {
    if (slot.value === ownSlotValue) {
      return { ...slot, available: true }
    }

    const [hour, minute] = slot.value.split(':').map(Number)
    const isPastTime = isToday && hour * 60 + minute <= nowMinutes

    return {
      ...slot,
      available: !isPastTime && !occupiedTimes.has(slot.value),
    }
  })
}

function SlotGroup({
  label,
  slots,
  selectedTime,
  onSelect,
}: {
  label: string
  slots: AppointmentSlot[]
  selectedTime: string
  onSelect: (time: string) => void
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-clinic-ink/45">
        {label}
      </p>
      {slots.length > 0 ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {slots.map((slot) => (
            <button
              key={slot.value}
              type="button"
              disabled={!slot.available}
              aria-disabled={!slot.available}
              aria-label={slot.available ? slot.label : `${slot.label}, already unavailable`}
              onClick={() => {
                if (slot.available) onSelect(slot.value)
              }}
              className={`rounded-xl border px-3 py-3 text-sm font-semibold transition ${
                selectedTime === slot.value
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
        <p className="rounded-xl border border-dashed border-clinic-line bg-white px-3 py-3 text-sm text-clinic-ink/45">
          No slots available
        </p>
      )}
    </div>
  )
}

function occupiesTimeSlot(status: AppointmentStatus) {
  return status !== 'Cancelled' && status !== 'No show'
}

function loadPatients(): Patient[] {
  const savedPatients = localStorage.getItem(PATIENTS_STORAGE_KEY)

  if (!savedPatients) return []

  try {
    const parsed: unknown = JSON.parse(savedPatients)
    if (!Array.isArray(parsed)) return []

    const seenIds = new Set<string>()

    return parsed.filter((value): value is Patient => {
      if (!value || typeof value !== 'object') return false

      const patient = value as Record<string, unknown>
      const id = patient.id
      const name = patient.name
      const phone = patient.phone

      if (
        typeof id !== 'string' ||
        !id.trim() ||
        typeof name !== 'string' ||
        !name.trim() ||
        typeof phone !== 'string' ||
        !phone.trim() ||
        seenIds.has(id)
      ) {
        return false
      }

      seenIds.add(id)
      return true
    })
  } catch {
    return []
  }
}

function loadAppointments(): Appointment[] {
  const savedAppointments = localStorage.getItem(APPOINTMENTS_STORAGE_KEY)

  if (!savedAppointments) return []

  try {
    const parsed: unknown = JSON.parse(savedAppointments)
    if (!Array.isArray(parsed)) return []

    const seenIds = new Set<string>()

    return parsed.filter((value): value is Appointment => {
      if (!value || typeof value !== 'object') return false

      const appointment = value as Record<string, unknown>
      const id = appointment.id
      const patientId = appointment.patientId
      const patientName = appointment.patientName
      const date = appointment.date
      const time = appointment.time
      const reason = appointment.reason
      const notes = appointment.notes
      const requiredVisits = appointment.requiredVisits ?? '1'

      if (
        typeof id !== 'string' ||
        !id.trim() ||
        seenIds.has(id) ||
        typeof patientId !== 'string' ||
        !patientId.trim() ||
        typeof patientName !== 'string' ||
        !patientName.trim() ||
        !isValidDateString(date) ||
        !isValidTimeString(time) ||
        typeof reason !== 'string' ||
        !reason.trim() ||
        !isAppointmentStatus(appointment.status) ||
        typeof notes !== 'string' ||
        typeof requiredVisits !== 'string' ||
        !/^\d+$/.test(requiredVisits) ||
        !isSafeInteger(Number(requiredVisits), 1, 50)
      ) {
        return false
      }

      const optionalStringFields = [
        'disease',
        'plannedTreatments',
        'actionReason',
        'treatmentDetails',
        'revisitDate',
        'rescheduleDate',
        'rescheduleTime',
      ] as const

      for (const field of optionalStringFields) {
        if (appointment[field] !== undefined && typeof appointment[field] !== 'string') {
          return false
        }
      }

      if (
        appointment.revisitDate !== undefined &&
        appointment.revisitDate !== '' &&
        !isValidDateString(appointment.revisitDate)
      ) {
        return false
      }

      if (
        appointment.rescheduleDate !== undefined &&
        appointment.rescheduleDate !== '' &&
        !isValidDateString(appointment.rescheduleDate)
      ) {
        return false
      }

      if (
        appointment.rescheduleTime !== undefined &&
        appointment.rescheduleTime !== '' &&
        !isValidTimeString(appointment.rescheduleTime)
      ) {
        return false
      }

      seenIds.add(id)
      return true
    })
  } catch {
    return []
  }
}

export function AppointmentsPage() {
  const [searchParams] = useSearchParams()
  const [patients] = useState<Patient[]>(loadPatients)
  const [appointments, setAppointments] = useState<Appointment[]>(loadAppointments)
  const [patientSearch, setPatientSearch] = useState(() => {
    const patientId = searchParams.get('patientId')
    const linkedPatient = loadPatients().find((patient) => patient.id === patientId)

    return linkedPatient ? `${linkedPatient.name} — ${linkedPatient.phone}` : ''
  })
  const [appointmentSearch, setAppointmentSearch] = useState('')
  const [appointmentScope, setAppointmentScope] = useState<AppointmentScope>('day')
  const [selectedDate, setSelectedDate] = useState(() => {
    const appointmentId = searchParams.get('appointmentId')
    const linkedAppointment = loadAppointments().find(
      (appointment) => appointment.id === appointmentId,
    )

    return linkedAppointment?.date || getToday()
  })
  const [showForm, setShowForm] = useState(() => {
    const patientId = searchParams.get('patientId')
    return loadPatients().some((patient) => patient.id === patientId)
  })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formError, setFormError] = useState('')
  const [form, setForm] = useState(() => ({
    ...emptyAppointment,
    patientId: (() => {
      const patientId = searchParams.get('patientId')
      return loadPatients().some((patient) => patient.id === patientId)
        ? patientId || ''
        : ''
    })(),
  }))
  const [pendingStatus, setPendingStatus] = useState<{
    appointmentId: string
    status: AppointmentStatus
  } | null>(null)
  const [statusAction, setStatusAction] = useState(emptyStatusAction)
  const [statusError, setStatusError] = useState('')
  const [openStatusId, setOpenStatusId] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState<{
    appointment: Appointment
    patientPhone: string
    kind: 'booked' | 'completed'
  } | null>(null)
  const [preponingAppointment, setPreponingAppointment] = useState<Appointment | null>(null)
  const [highlightedAppointmentId, setHighlightedAppointmentId] = useState<string | null>(
    () => searchParams.get('appointmentId'),
  )

  const selectedDateIsSunday = isSunday(form.date)
  const daySlots = useMemo(
    () => getDaySlots(form.date, appointments, editingId),
    [appointments, editingId, form.date],
  )
  const availableMorningSlots = daySlots.filter((slot) => slot.value < '15:00')
  const availableEveningSlots = daySlots.filter((slot) => slot.value >= '17:00')

  const saveAppointments = (updatedAppointments: Appointment[]) => {
    setAppointments(updatedAppointments)
    localStorage.setItem(
      APPOINTMENTS_STORAGE_KEY,
      JSON.stringify(updatedAppointments),
    )
  }

  const visibleAppointments = useMemo(() => {
    const query = appointmentSearch.trim().toLowerCase()

    return appointments
      .filter((appointment) =>
        appointmentScope === 'all' || appointment.date === selectedDate,
      )
      .filter((appointment) =>
        !query || `${appointment.patientName} ${appointment.reason} ${appointment.date}`
          .toLowerCase()
          .includes(query),
      )
      .sort((a, b) => a.time.localeCompare(b.time))
  }, [appointmentSearch, appointmentScope, appointments, selectedDate])

  useEffect(() => {
    if (!highlightedAppointmentId) return

    const rows = document.querySelectorAll<HTMLElement>(
      `[data-appointment-id="${highlightedAppointmentId}"]`,
    )
    const visibleRow =
      Array.from(rows).find((row) => row.offsetParent !== null) ?? rows[0]

    visibleRow?.scrollIntoView({ behavior: 'smooth', block: 'center' })

    const fadeTimeout = setTimeout(() => setHighlightedAppointmentId(null), 4000)
    return () => clearTimeout(fadeTimeout)
  }, [highlightedAppointmentId, visibleAppointments])

  const filteredPatients = useMemo(() => {
    const query = patientSearch.trim().toLowerCase()

    if (!query || form.patientId) return []

    return patients.filter((patient) =>
      `${patient.name} ${patient.phone}`.toLowerCase().includes(query),
    )
  }, [form.patientId, patients, patientSearch])

  const startAddAppointment = () => {
    const date = selectedDate
    const slots = getDaySlots(date, appointments, null).filter((slot) => slot.available)

    setEditingId(null)
    setPatientSearch('')
    setForm({
      ...emptyAppointment,
      date,
      time: slots[0]?.value || '',
    })
    setFormError('')
    setShowForm(true)
  }

  const handleAppointmentDateChange = (date: string) => {
    const slots = getDaySlots(date, appointments, editingId).filter((slot) => slot.available)

    setForm({
      ...form,
      date,
      time: isSunday(date) ? '' : slots[0]?.value || '',
    })
  }

  const startEditAppointment = (appointment: Appointment) => {
    setEditingId(appointment.id)
    setPatientSearch(appointment.patientName)

    setForm({
      patientId: appointment.patientId,
      date: appointment.date,
      time: appointment.time,
      reason: appointment.reason,
      status: appointment.status,
      notes: appointment.notes,
      disease: appointment.disease || '',
      requiredVisits: appointment.requiredVisits || '1',
      plannedTreatments: appointment.plannedTreatments || '',
    })

    setFormError('')
    setShowForm(true)
  }

  const closeForm = () => {
    setShowForm(false)
    setEditingId(null)
    setPatientSearch('')
    setForm(emptyAppointment)
    setFormError('')
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError('')

    if (!form.patientId) {
      setFormError('Please select a patient.')
      return
    }

    if (!form.date) {
      setFormError('Please select an appointment date.')
      return
    }

    if (!isValidDateString(form.date)) {
      setFormError('Please select a valid appointment date.')
      return
    }

    if (!form.time) {
      setFormError('Please select an appointment time.')
      return
    }

    if (!isValidTimeString(form.time)) {
      setFormError('Please select a valid appointment time.')
      return
    }

    const existingAppointment = editingId
      ? appointments.find((currentAppointment) => currentAppointment.id === editingId)
      : null

    if (form.date < getToday() && (!existingAppointment || form.date !== existingAppointment.date)) {
      setFormError('Appointments cannot be moved to a past date.')
      return
    }

    if (!form.reason.trim()) {
      setFormError(
        selectedDateIsSunday
          ? 'Please enter the urgency reason.'
          : 'Please enter the reason for the appointment.',
      )
      return
    }

    if (form.reason.trim().length > 500) {
      setFormError('Reason for visit must be 500 characters or fewer.')
      return
    }

    if (form.disease.trim().length > 500) {
      setFormError('Main dental concern must be 500 characters or fewer.')
      return
    }

    if (form.plannedTreatments.trim().length > 2000) {
      setFormError('Planned treatments must be 2000 characters or fewer.')
      return
    }

    if (form.notes.trim().length > 5000) {
      setFormError('Notes must be 5000 characters or fewer.')
      return
    }

    if (!/^\d+$/.test(form.requiredVisits)) {
      setFormError('Expected visits must be a whole number between 1 and 50.')
      return
    }

    const requiredVisits = Number(form.requiredVisits)

    if (requiredVisits < 1 || requiredVisits > 50) {
      setFormError('Expected visits must be a whole number between 1 and 50.')
      return
    }

    if (
      !selectedDateIsSunday &&
      !daySlots.some((slot) => slot.value === form.time && slot.available)
    ) {
      setFormError('Please choose an available appointment slot.')
      return
    }

    const timeSlotOccupied = appointments.some(
      (appointment) =>
        appointment.id !== editingId &&
        occupiesTimeSlot(appointment.status) &&
        appointment.date === form.date &&
        appointment.time === form.time,
    )

    if (timeSlotOccupied) {
      setFormError('This time slot is already occupied. Please choose another time.')
      return
    }

    const patient = patients.find(
      (currentPatient) => currentPatient.id === form.patientId,
    )

    if (!patient) {
      setFormError('The selected patient could not be found.')
      return
    }

    const appointment: Appointment = {
      id: editingId ?? crypto.randomUUID(),
      patientId: patient.id,
      patientName: patient.name,
      date: form.date,
      time: form.time,
      reason: form.reason.trim(),
      status: form.status,
      notes: form.notes.trim(),
      disease: form.disease.trim(),
      requiredVisits: String(requiredVisits),
      plannedTreatments: form.plannedTreatments.trim(),
    }

    if (existingAppointment && existingAppointment.status !== form.status) {
      setFormError('Change the appointment status from the schedule action menu so the action can be confirmed and documented.')
      return
    }

    if (editingId) {
      saveAppointments(
        appointments.map((currentAppointment) =>
          currentAppointment.id === editingId
            ? appointment
            : currentAppointment,
        ),
      )
    } else {
      saveAppointments([...appointments, appointment])

      setConfirmation({
        appointment,
        patientPhone: patient.phone,
        kind: 'booked',
      })
    }

    setSelectedDate(form.date)
    closeForm()
  }

  const updateStatus = (
    appointmentId: string,
    status: AppointmentStatus,
  ) => {
    const appointment = appointments.find(
      (currentAppointment) => currentAppointment.id === appointmentId,
    )

    if (!appointment || appointment.status === status) return

    setPendingStatus({ appointmentId, status })
    setStatusAction({
      ...emptyStatusAction,
      rescheduleDate: status === 'No show' ? appointment.date : '',
    })
    setStatusError('')
  }

  const closeStatusAction = () => {
    setPendingStatus(null)
    setStatusAction(emptyStatusAction)
    setStatusError('')
  }

  const confirmStatusAction = () => {
    if (!pendingStatus) return

    const appointment = appointments.find(
      (currentAppointment) => currentAppointment.id === pendingStatus.appointmentId,
    )

    if (!appointment) return

    if (!isAppointmentStatus(pendingStatus.status)) {
      setStatusError('Invalid appointment status.')
      return
    }

    if (
      pendingStatus.status !== 'Under treatment' &&
      !statusAction.reason.trim()
    ) {
      setStatusError('Please explain why this status is being recorded.')
      return
    }

    if (
      (pendingStatus.status === 'Completed' ||
        pendingStatus.status === 'Under treatment') &&
      !statusAction.treatmentDetails.trim()
    ) {
      setStatusError('Please describe the treatment or care provided.')
      return
    }

    if (statusAction.reason.trim().length > 1000) {
      setStatusError('The action reason must be 1000 characters or fewer.')
      return
    }

    if (statusAction.treatmentDetails.trim().length > 5000) {
      setStatusError('Treatment details must be 5000 characters or fewer.')
      return
    }

    if (
      statusAction.revisitDate &&
      !isValidDateString(statusAction.revisitDate)
    ) {
      setStatusError('Please choose a valid revisit date.')
      return
    }

    const requiresReschedule =
      pendingStatus.status === 'Cancelled' || pendingStatus.status === 'No show'

    if (
      requiresReschedule &&
      Boolean(statusAction.rescheduleDate) !== Boolean(statusAction.rescheduleTime)
    ) {
      setStatusError('Choose both a rescheduled date and time, or leave both blank.')
      return
    }

    if (statusAction.rescheduleDate && !isValidDateString(statusAction.rescheduleDate)) {
      setStatusError('Please choose a valid rescheduled date.')
      return
    }

    if (statusAction.rescheduleTime && !isValidTimeString(statusAction.rescheduleTime)) {
      setStatusError('Please choose a valid rescheduled time.')
      return
    }

    if (statusAction.rescheduleDate && statusAction.rescheduleDate < getToday()) {
      setStatusError('A rescheduled appointment cannot be placed in the past.')
      return
    }

    if (statusAction.rescheduleDate && statusAction.rescheduleDate === getToday()) {
      const [hour, minute] = statusAction.rescheduleTime.split(':').map(Number)
      const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes()

      if (hour * 60 + minute <= nowMinutes) {
        setStatusError('A rescheduled appointment must use a future time today.')
        return
      }
    }

    if (statusAction.rescheduleDate && isSunday(statusAction.rescheduleDate)) {
      setStatusError('Regular rescheduled appointments cannot be placed on Sunday.')
      return
    }

    if (
      statusAction.rescheduleDate &&
      !isSunday(statusAction.rescheduleDate) &&
      (!getDaySlots(statusAction.rescheduleDate, appointments, appointment.id).some(
        (slot) => slot.value === statusAction.rescheduleTime && slot.available,
      ))
    ) {
      setStatusError('Please choose an available rescheduled appointment slot.')
      return
    }

    if (occupiesTimeSlot(pendingStatus.status)) {
      const timeSlotOccupied = appointments.some(
        (currentAppointment) =>
          currentAppointment.id !== appointment.id &&
          occupiesTimeSlot(currentAppointment.status) &&
          currentAppointment.date === appointment.date &&
          currentAppointment.time === appointment.time,
      )

      if (timeSlotOccupied) {
        setStatusError('This time slot is already occupied. Please choose another time.')
        return
      }
    }

    const updatedAppointment = {
      ...appointment,
      status: pendingStatus.status,
      actionReason: statusAction.reason.trim(),
      treatmentDetails: statusAction.treatmentDetails.trim(),
      revisitDate: statusAction.revisitDate,
      rescheduleDate: statusAction.rescheduleDate,
      rescheduleTime: statusAction.rescheduleTime,
    }

    const rescheduledAppointment =
      requiresReschedule &&
      statusAction.rescheduleDate &&
      statusAction.rescheduleTime
        ? {
            id: crypto.randomUUID(),
            patientId: appointment.patientId,
            patientName: appointment.patientName,
            date: statusAction.rescheduleDate,
            time: statusAction.rescheduleTime,
            reason: appointment.reason,
            status: 'Scheduled' as AppointmentStatus,
            notes: appointment.notes,
            disease: appointment.disease,
            requiredVisits: appointment.requiredVisits,
            plannedTreatments: appointment.plannedTreatments,
          }
        : null

    saveAppointments([
      ...appointments.map((currentAppointment) =>
        currentAppointment.id === appointment.id
          ? updatedAppointment
          : currentAppointment,
      ),
      ...(rescheduledAppointment ? [rescheduledAppointment] : []),
    ])
    closeStatusAction()

    if (pendingStatus.status === 'Completed') {
      setConfirmation({
        appointment: {
          ...appointment,
          status: pendingStatus.status,
          actionReason: statusAction.reason.trim(),
          treatmentDetails: statusAction.treatmentDetails.trim(),
          revisitDate: statusAction.revisitDate,
          rescheduleDate: statusAction.rescheduleDate,
          rescheduleTime: statusAction.rescheduleTime,
        },
        patientPhone:
          patients.find((patient) => patient.id === appointment.patientId)?.phone || '',
        kind: 'completed',
      })
    }
  }

  const deleteAppointment = (appointmentId: string) => {
    const appointment = appointments.find(
      (currentAppointment) => currentAppointment.id === appointmentId,
    )

    if (!appointment) return

    const confirmed = window.confirm(
      `Delete the appointment for ${appointment.patientName}?`,
    )

    if (!confirmed) return

    saveAppointments(
      appointments.filter(
        (currentAppointment) => currentAppointment.id !== appointmentId,
      ),
    )
  }

  const requestEarlierSlot = (appointment: Appointment) => {
    setOpenStatusId(null)
    setPreponingAppointment(appointment)
  }

  const getStatusClasses = (status: AppointmentStatus) => {
    switch (status) {
      case 'Completed':
        return 'bg-green-50 text-green-700'
      case 'Under treatment':
        return 'bg-teal-50 text-clinic-teal'
      case 'Cancelled':
        return 'bg-red-50 text-red-700'
      case 'No show':
        return 'bg-amber-50 text-amber-700'
      default:
        return 'bg-blue-50 text-blue-700'
    }
  }

  return (
    <div className="min-h-full">
      <div>
        <p className="text-sm font-medium text-clinic-teal">
          Clinic schedule
        </p>

        <div className="mt-1 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-display text-4xl text-clinic-ink">
              Appointments
            </h1>

            <p className="mt-2 text-sm text-clinic-ink/55">
              Schedule and manage patient appointments.
            </p>
          </div>

          <button
            type="button"
            onClick={startAddAppointment}
            className="rounded-xl bg-clinic-teal px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-clinic-teal/90 focus:outline-none focus:ring-2 focus:ring-clinic-teal focus:ring-offset-2"
          >
            + New appointment
          </button>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-clinic-line bg-white p-3 shadow-sm sm:p-4">
        <div className="grid gap-3 sm:grid-cols-[180px_1fr_1fr]">
          <div>
            <label
              htmlFor="appointment-date"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-clinic-ink/45"
            >
              Date
            </label>

            <input
              id="appointment-date"
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              className="w-full rounded-xl border border-clinic-line bg-clinic-paper px-3 py-3 text-sm text-clinic-ink outline-none focus:border-clinic-teal focus:ring-4 focus:ring-clinic-teal/10"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-clinic-ink/45">
              View appointments
            </label>

            <div className="flex rounded-xl border border-clinic-line bg-clinic-paper p-1">
              {(['day', 'all'] as AppointmentScope[]).map((scope) => (
                <button
                  key={scope}
                  type="button"
                  onClick={() => setAppointmentScope(scope)}
                  className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                    appointmentScope === scope
                      ? 'bg-white text-clinic-teal shadow-sm'
                      : 'text-clinic-ink/50 hover:text-clinic-ink'
                  }`}
                >
                  {scope === 'day' ? 'Selected day' : 'All appointments'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="appointment-search" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-clinic-ink/45">
              Search all shown
            </label>

            <div className="relative">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-clinic-teal" />
              <input
                id="appointment-search"
                type="search"
                value={appointmentSearch}
                onChange={(event) => setAppointmentSearch(event.target.value)}
                placeholder="Patient, reason or date..."
                className="w-full rounded-xl border border-clinic-teal/25 bg-clinic-paper py-3 pl-10 pr-4 text-sm text-clinic-ink outline-none placeholder:text-clinic-ink/45 focus:border-clinic-teal focus:ring-4 focus:ring-clinic-teal/10"
              />
            </div>
          </div>

        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-clinic-line bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-clinic-line px-5 py-4">
          <div>
            <h2 className="font-display text-2xl text-clinic-ink">
              {appointmentScope === 'all'
                ? 'All appointments'
                : selectedDate === getToday()
                ? "Today's schedule"
                : `Schedule for ${formatDate(selectedDate)}`}
            </h2>

            <p className="mt-1 text-xs text-clinic-ink/45">
              {visibleAppointments.length}{' '}
              {visibleAppointments.length === 1
                ? 'appointment'
                : 'appointments'}
            </p>
          </div>
        </div>

        {visibleAppointments.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-clinic-paper text-lg font-semibold text-clinic-teal">
              A
            </div>

            <h3 className="mt-4 text-sm font-semibold text-clinic-ink">
              No appointments found
            </h3>

            <p className="mt-1 text-sm text-clinic-ink/50">
              Book an appointment to see it in the daily schedule.
            </p>

          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-clinic-line text-left text-xs uppercase tracking-wider text-clinic-ink/40">
                    <th className="px-5 py-3 font-semibold">Time</th>
                    <th className="px-5 py-3 font-semibold">Patient</th>
                    <th className="px-5 py-3 font-semibold">Reason</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 text-right font-semibold">
                      Actions
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {visibleAppointments.map((appointment) => (
                    <tr
                      key={appointment.id}
                      data-appointment-id={appointment.id}
                      className={`border-b border-clinic-line last:border-0 transition-colors ${
                        highlightedAppointmentId === appointment.id
                          ? 'bg-amber-50 ring-2 ring-inset ring-clinic-clay/40'
                          : ''
                      }`}
                    >
                      <td className="whitespace-nowrap px-5 py-4 text-sm font-semibold text-clinic-teal">
                        {appointment.time}
                      </td>

                      <td className="px-5 py-4">
                        <div className="text-sm font-semibold text-clinic-ink">
                          {appointment.patientName}
                        </div>
                      </td>

                      <td className="px-5 py-4 text-sm text-clinic-ink/60">
                        {appointment.reason}

                        {appointment.actionReason && (
                          <div className="mt-1 text-xs text-clinic-ink/45">
                            Action: {appointment.actionReason}
                          </div>
                        )}

                        {appointment.treatmentDetails && (
                          <div className="mt-1 text-xs text-clinic-success">
                            Treatment: {appointment.treatmentDetails}
                          </div>
                        )}

                        {appointment.rescheduleDate && appointment.rescheduleTime && (
                          <div className="mt-1 text-xs font-medium text-clinic-teal">
                            Rescheduled: {formatDate(appointment.rescheduleDate)} at {appointment.rescheduleTime}
                          </div>
                        )}
                      </td>

                      <td className="px-5 py-4">
                        <div className="relative inline-block">
                          <button
                            type="button"
                            onClick={() =>
                              setOpenStatusId(
                                openStatusId === appointment.id
                                  ? null
                                  : appointment.id,
                              )
                            }
                            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition hover:ring-2 hover:ring-clinic-teal/20 ${getStatusClasses(
                              appointment.status,
                            )}`}
                            aria-expanded={openStatusId === appointment.id}
                            aria-haspopup="listbox"
                            aria-label={`Change status for ${appointment.patientName}`}
                          >
                            {appointment.status}
                          </button>

                          {openStatusId === appointment.id && (
                            <div
                              role="listbox"
                              className="absolute right-0 z-20 mt-2 max-h-48 w-44 overflow-y-auto rounded-xl border border-clinic-line bg-white p-1 text-left shadow-xl"
                            >
                              {appointmentStatuses.map((status) => (
                                <button
                                  key={status}
                                  type="button"
                                  role="option"
                                  aria-selected={appointment.status === status}
                                  onClick={() => {
                                    setOpenStatusId(null)
                                    updateStatus(appointment.id, status)
                                  }}
                                  className={`block w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium transition hover:bg-clinic-paper ${
                                    appointment.status === status
                                      ? 'text-clinic-teal'
                                      : 'text-clinic-ink/70'
                                  }`}
                                >
                                  {status}
                                </button>
                              ))}

                              {appointment.date > getToday() && (
                                <button
                                  type="button"
                                  onClick={() => requestEarlierSlot(appointment)}
                                  className="mt-1 block w-full border-t border-clinic-line px-3 py-2.5 text-left text-sm font-semibold text-clinic-clay hover:bg-amber-50"
                                >
                                  Request earlier slot
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        {appointment.status === 'No show' &&
                          !appointment.rescheduleDate && (
                            <div className="mt-1 text-xs font-semibold text-clinic-clay">
                              Rescheduling needed
                            </div>
                          )}
                      </td>

                      <td className="px-5 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          {appointment.date > getToday() && (
                            <button
                              type="button"
                              onClick={() => requestEarlierSlot(appointment)}
                              className="rounded-lg px-3 py-2 text-xs font-semibold text-clinic-clay hover:bg-amber-50"
                            >
                              Request earlier slot
                            </button>
                          )}

                          <button
                            onClick={() => startEditAppointment(appointment)}
                            className="rounded-lg px-3 py-2 text-xs font-semibold text-clinic-teal hover:bg-clinic-paper"
                          >
                            Edit
                          </button>

                          <button
                            onClick={() => deleteAppointment(appointment.id)}
                            className="rounded-lg px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-clinic-line md:hidden">
              {visibleAppointments.map((appointment) => (
                <div
                  key={appointment.id}
                  data-appointment-id={appointment.id}
                  className={`p-4 transition-colors ${
                    highlightedAppointmentId === appointment.id
                      ? 'bg-amber-50 ring-2 ring-inset ring-clinic-clay/40'
                      : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-lg font-semibold text-clinic-teal">
                        {appointment.time}
                      </div>

                      <div className="mt-1 text-sm font-semibold text-clinic-ink">
                        {appointment.patientName}
                      </div>
                    </div>

                    <div className="relative">
                      <button
                        type="button"
                        onClick={() =>
                          setOpenStatusId(
                            openStatusId === appointment.id
                              ? null
                              : appointment.id,
                          )
                        }
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusClasses(
                          appointment.status,
                        )}`}
                        aria-expanded={openStatusId === appointment.id}
                        aria-haspopup="listbox"
                        aria-label={`Change status for ${appointment.patientName}`}
                      >
                        {appointment.status}
                      </button>

                      {openStatusId === appointment.id && (
                        <div
                          role="listbox"
                          className="absolute right-0 z-20 mt-2 max-h-48 w-44 overflow-y-auto rounded-xl border border-clinic-line bg-white p-1 text-left shadow-xl"
                        >
                          {appointmentStatuses.map((status) => (
                            <button
                              key={status}
                              type="button"
                              role="option"
                              aria-selected={appointment.status === status}
                              onClick={() => {
                                setOpenStatusId(null)
                                updateStatus(appointment.id, status)
                              }}
                              className={`block w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium hover:bg-clinic-paper ${
                                appointment.status === status
                                  ? 'text-clinic-teal'
                                  : 'text-clinic-ink/70'
                              }`}
                            >
                              {status}
                            </button>
                          ))}

                          {appointment.date > getToday() && (
                            <button
                              type="button"
                              onClick={() => requestEarlierSlot(appointment)}
                              className="mt-1 block w-full border-t border-clinic-line px-3 py-2.5 text-left text-sm font-semibold text-clinic-clay hover:bg-amber-50"
                            >
                              Request earlier slot
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {appointment.status === 'No show' &&
                    !appointment.rescheduleDate && (
                      <div className="mt-2 text-xs font-semibold text-clinic-clay">
                        Rescheduling needed
                      </div>
                    )}

                  <p className="mt-3 text-sm text-clinic-ink/60">
                    {appointment.reason}
                  </p>

                  {appointment.actionReason && (
                    <p className="mt-2 text-xs text-clinic-ink/45">
                      Action: {appointment.actionReason}
                    </p>
                  )}

                  {appointment.treatmentDetails && (
                    <p className="mt-1 text-xs text-clinic-success">
                      Treatment: {appointment.treatmentDetails}
                    </p>
                  )}

                  {appointment.rescheduleDate && appointment.rescheduleTime && (
                    <p className="mt-1 text-xs font-medium text-clinic-teal">
                      Rescheduled: {formatDate(appointment.rescheduleDate)} at {appointment.rescheduleTime}
                    </p>
                  )}

                  <div className="mt-4 flex gap-2">
                    {appointment.date > getToday() && (
                      <button
                        type="button"
                        onClick={() => requestEarlierSlot(appointment)}
                        className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-clinic-clay"
                      >
                        Request earlier slot
                      </button>
                    )}

                    <button
                      onClick={() => startEditAppointment(appointment)}
                      className="rounded-lg bg-clinic-paper px-3 py-2 text-xs font-semibold text-clinic-teal"
                    >
                      Edit
                    </button>

                    <button
                      onClick={() => deleteAppointment(appointment.id)}
                      className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-600"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {preponingAppointment && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border-2 border-clinic-teal/25 bg-white p-6 shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-widest text-clinic-teal">
              Earlier appointment request
            </p>
            <h2 className="mt-1 font-display text-2xl text-clinic-ink">
              Request a sooner slot?
            </h2>
            <p className="mt-2 text-sm text-clinic-ink/55">
              Send the patient a WhatsApp request asking whether an earlier appointment is convenient.
            </p>
            <div className="mt-4 rounded-xl bg-clinic-paper p-4 text-sm">
              <strong>{preponingAppointment.patientName}</strong>
              <p className="mt-1 text-clinic-ink/55">
                Current booking: {formatDate(preponingAppointment.date)} at {preponingAppointment.time}
              </p>
            </div>
            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setPreponingAppointment(null)}
                className="rounded-xl border border-clinic-line px-4 py-3 text-sm font-semibold text-clinic-ink/70 hover:bg-clinic-paper"
              >
                Cancel
              </button>
              <a
                href={getWhatsAppUrl(
                  patients.find((patient) => patient.id === preponingAppointment.patientId)?.phone || '',
                  `Joshi Dental Clinic: Would an earlier appointment be convenient for you? Your current booking is ${formatDate(preponingAppointment.date)} at ${preponingAppointment.time}. Please call 7090763509 if you are ready to reschedule. Booking ID: ${preponingAppointment.id}.`,
                ) || '#'}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl bg-[#25D366] px-4 py-3 text-center text-sm font-semibold text-white hover:bg-[#20bd5a]"
              >
                Continue in WhatsApp
              </a>
            </div>
          </div>
        </div>
      )}

      {confirmation && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border-2 border-clinic-success/30 bg-white p-6 shadow-2xl">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-50 text-xl text-clinic-success">
              ✓
            </div>

            <h2 className="mt-4 font-display text-2xl text-clinic-ink">
              {confirmation.kind === 'booked'
                ? 'Appointment booked'
                : 'Appointment completed'}
            </h2>

            <p className="mt-1 text-sm text-clinic-ink/55">
              {confirmation.kind === 'booked'
                ? 'The appointment is now on the schedule. Booking details are ready to share.'
                : 'The schedule has been updated and the booking details are ready to share.'}
            </p>

            <div className="mt-5 space-y-2 rounded-xl bg-clinic-paper p-4 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-clinic-ink/55">Booking ID</span>
                <strong className="font-mono text-clinic-teal">{confirmation.appointment.id}</strong>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-clinic-ink/55">Patient</span>
                <strong>{confirmation.appointment.patientName}</strong>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-clinic-ink/55">Date and time</span>
                <strong>{formatDate(confirmation.appointment.date)} at {confirmation.appointment.time}</strong>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
              {confirmation.patientPhone && (
                <a
                  href={getWhatsAppUrl(
                    confirmation.patientPhone,
                    `Joshi Dental Clinic: Your appointment is ${confirmation.kind}. Booking ID: ${confirmation.appointment.id}. Date: ${formatDate(confirmation.appointment.date)} at ${confirmation.appointment.time}.`,
                  ) || '#'}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-xl bg-[#25D366] px-4 py-3 text-center text-sm font-semibold text-white hover:bg-[#20bd5a]"
                >
                  Continue in WhatsApp
                </a>
              )}

              <button
                type="button"
                onClick={() => setConfirmation(null)}
                className="rounded-xl border border-clinic-line px-4 py-3 text-sm font-semibold text-clinic-ink/70 hover:bg-clinic-paper"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingStatus && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border-2 border-clinic-teal/35 bg-white p-6 shadow-2xl ring-4 ring-clinic-teal/10">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-clinic-teal">
                  Confirm status action
                </p>

                <h2 className="mt-1 font-display text-2xl text-clinic-ink">
                  Mark as {pendingStatus.status}
                </h2>

                <p className="mt-1 text-sm text-clinic-ink/55">
                  Record what happened before updating this appointment.
                </p>
              </div>

              <button
                type="button"
                onClick={closeStatusAction}
                aria-label="Close status action"
                className="rounded-lg p-1 text-clinic-ink/45 hover:bg-clinic-paper hover:text-clinic-ink"
              >
                <X aria-hidden="true" className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              {pendingStatus.status !== 'Under treatment' && (
              <div>
                <label
                  htmlFor="status-action-reason"
                  className="mb-1.5 block text-sm font-semibold text-clinic-ink"
                >
                  Why is this action being taken? <span className="text-clinic-clay">*</span>
                </label>

                <textarea
                  id="status-action-reason"
                  value={statusAction.reason}
                  onChange={(event) =>
                    setStatusAction({ ...statusAction, reason: event.target.value })
                  }
                  rows={2}
                  placeholder="e.g. Patient arrived and treatment was completed"
                  className="w-full resize-none rounded-xl border border-clinic-line bg-clinic-paper px-3 py-3 text-sm outline-none focus:border-clinic-teal focus:ring-4 focus:ring-clinic-teal/10"
                />
              </div>
              )}

              {(pendingStatus.status === 'Completed' ||
                pendingStatus.status === 'Under treatment') && (
                <div>
                  <label
                    htmlFor="treatment-details"
                    className="mb-1.5 block text-sm font-semibold text-clinic-ink"
                  >
                    {pendingStatus.status === 'Completed'
                      ? 'Treatment or care provided'
                      : 'Treatment currently underway'}{' '}
                    <span className="text-clinic-clay">*</span>
                  </label>

                  <textarea
                    id="treatment-details"
                    value={statusAction.treatmentDetails}
                    onChange={(event) =>
                      setStatusAction({
                        ...statusAction,
                        treatmentDetails: event.target.value,
                      })
                    }
                    rows={2}
                    placeholder={pendingStatus.status === 'Completed'
                      ? 'Describe the treatment completed'
                      : 'Describe the treatment currently underway'}
                    className="w-full resize-none rounded-xl border border-clinic-line bg-clinic-paper px-3 py-3 text-sm outline-none focus:border-clinic-teal focus:ring-4 focus:ring-clinic-teal/10"
                  />
                </div>
              )}

              {pendingStatus.status === 'Completed' && (
                <div>
                  <label
                    htmlFor="revisit-date"
                    className="mb-1.5 block text-sm font-semibold text-clinic-ink"
                  >
                    Suggested revisit date <span className="font-normal text-clinic-ink/45">(optional)</span>
                  </label>

                  <div className="relative">
                    <CalendarClock
                      aria-hidden="true"
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-clinic-teal"
                    />

                    <input
                      id="revisit-date"
                      type="date"
                      min={getToday()}
                      value={statusAction.revisitDate}
                      onChange={(event) =>
                        setStatusAction({ ...statusAction, revisitDate: event.target.value })
                      }
                      className="w-full rounded-xl border border-clinic-line bg-clinic-paper py-3 pl-10 pr-3 text-sm outline-none focus:border-clinic-teal focus:ring-4 focus:ring-clinic-teal/10"
                    />
                  </div>
                </div>
              )}

              {(pendingStatus.status === 'Cancelled' || pendingStatus.status === 'No show') && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <p className="text-sm font-semibold text-amber-900">
                    Rescheduling is optional
                  </p>

                  <p className="mt-1 text-xs text-amber-800">
                    Leave both fields blank if a new appointment cannot be arranged. The schedule will highlight that follow-up is needed.
                  </p>

                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <input
                      aria-label="Rescheduled date"
                      type="date"
                      min={getToday()}
                      value={statusAction.rescheduleDate}
                      onChange={(event) =>
                        setStatusAction({ ...statusAction, rescheduleDate: event.target.value })
                      }
                      className="rounded-xl border border-amber-300 bg-white px-3 py-3 text-sm outline-none focus:border-clinic-teal focus:ring-4 focus:ring-clinic-teal/10"
                    />

                    <input
                      aria-label="Rescheduled time"
                      type="time"
                      value={statusAction.rescheduleTime}
                      onChange={(event) =>
                        setStatusAction({ ...statusAction, rescheduleTime: event.target.value })
                      }
                      className="rounded-xl border border-amber-300 bg-white px-3 py-3 text-sm outline-none focus:border-clinic-teal focus:ring-4 focus:ring-clinic-teal/10"
                    />
                  </div>
                </div>
              )}

              {statusError && (
                <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700" role="alert">
                  {statusError}
                </p>
              )}
            </div>

            <div className="mt-5 flex flex-col-reverse gap-3 border-t border-clinic-line pt-5 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeStatusAction}
                className="rounded-xl border border-clinic-line px-5 py-3 text-sm font-semibold text-clinic-ink/70 hover:bg-clinic-paper"
              >
                Go back
              </button>

              <button
                type="button"
                onClick={confirmStatusAction}
                className="rounded-xl bg-clinic-teal px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-clinic-teal/90"
              >
                Confirm action
              </button>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeForm()
            }
          }}
        >
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border-2 border-clinic-teal/25 bg-white shadow-2xl ring-4 ring-clinic-teal/10">
            <div className="border-b border-clinic-line bg-clinic-paper/70 px-6 py-6">
              <p className="text-xs font-semibold uppercase tracking-widest text-clinic-teal">
                {editingId ? 'Update booking' : 'New booking'}
              </p>

              <h2 className="font-display text-3xl text-clinic-ink">
                {editingId ? 'Edit appointment' : 'New appointment'}
              </h2>

              <p className="mt-1 text-sm text-clinic-ink/50">
                Select an existing patient and add the appointment details.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5 p-6">
              <div>
                <label
                  htmlFor="patient-search"
                  className="mb-1.5 block text-sm font-semibold text-clinic-ink"
                >
                  Patient <span className="text-clinic-clay">*</span>
                </label>

                {patients.length === 0 ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    No patients are available yet. Add a patient first from
                    the Patients section.
                  </div>
                ) : (
                  <>
                    <div className="relative">
                      <Search
                        aria-hidden="true"
                        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-clinic-teal"
                      />

                      <input
                        id="patient-search"
                        type="search"
                        value={patientSearch}
                        onChange={(event) => {
                          setPatientSearch(event.target.value)
                          setForm({ ...form, patientId: '' })
                        }}
                        placeholder="Search patients by name or mobile number..."
                        aria-label="Search patients by name or mobile number"
                        role="combobox"
                        aria-expanded={filteredPatients.length > 0}
                        aria-controls="patient-search-results"
                        className="w-full rounded-xl border border-clinic-teal/25 bg-clinic-paper py-3 pl-10 pr-4 text-sm text-clinic-ink outline-none placeholder:text-clinic-ink/45 focus:border-clinic-teal focus:ring-4 focus:ring-clinic-teal/10"
                      />

                      {patientSearch.trim() && !form.patientId && (
                        <div
                          id="patient-search-results"
                          role="listbox"
                          className="absolute left-0 right-0 top-full z-10 mt-2 max-h-56 overflow-y-auto rounded-xl border border-clinic-teal/25 bg-white p-1 shadow-lg"
                        >
                          {filteredPatients.length > 0 ? (
                            filteredPatients
                              .slice()
                              .sort((a, b) => a.name.localeCompare(b.name))
                              .map((patient) => (
                                <button
                                  key={patient.id}
                                  type="button"
                                  role="option"
                                  aria-selected={form.patientId === patient.id}
                                  onClick={() => {
                                    setForm({ ...form, patientId: patient.id })
                                    setPatientSearch(`${patient.name} — ${patient.phone}`)
                                  }}
                                  className="flex w-full items-center justify-between rounded-lg px-3 py-3 text-left text-sm hover:bg-clinic-paper"
                                >
                                  <span className="font-semibold text-clinic-ink">
                                    {patient.name}
                                  </span>

                                  <span className="text-clinic-ink/55">
                                    {patient.phone}
                                  </span>
                                </button>
                              ))
                          ) : (
                            <p className="px-3 py-3 text-sm text-clinic-ink/55">
                              No patients match that search.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              <div className="rounded-2xl border border-clinic-line bg-clinic-paper/60 p-4">
                <div>
                  <label
                    htmlFor="appointment-form-date"
                    className="mb-1.5 block text-sm font-semibold text-clinic-ink"
                  >
                    Date <span className="text-clinic-clay">*</span>
                  </label>

                  <div className="relative">
                    <CalendarDays
                      aria-hidden="true"
                      className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-clinic-teal"
                    />

                    <input
                      id="appointment-form-date"
                      type="date"
                      min={editingId ? undefined : getToday()}
                      value={form.date}
                      onChange={(event) => handleAppointmentDateChange(event.target.value)}
                      className="w-full rounded-xl border-2 border-clinic-teal/20 bg-clinic-paper py-3 pl-11 pr-3 text-sm font-medium text-clinic-ink outline-none focus:border-clinic-teal focus:ring-4 focus:ring-clinic-teal/10"
                    />
                  </div>

                  <p className="mt-1.5 text-xs text-clinic-ink/45">
                    Step 1: choose the day of the visit
                  </p>
                </div>

                <div className="mt-5 border-t border-clinic-line pt-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-clinic-ink">
                        Step 2: choose an appointment time
                      </p>
                      <p className="mt-1 text-xs text-clinic-ink/45">
                        {selectedDateIsSunday
                          ? 'Sunday appointments use flexible urgent-care timing.'
                          : 'Available 30-minute slots are shown below.'}
                      </p>
                    </div>
                    <Clock aria-hidden="true" className="h-5 w-5 text-clinic-teal" />
                  </div>

                  {selectedDateIsSunday ? (
                    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                      <p className="text-sm font-semibold text-amber-900">
                        Urgent care only
                      </p>
                      <p className="mt-1 text-xs text-amber-800">
                        Regular appointments are unavailable on Sunday. For urgent dental treatment, a flexible time can be arranged.
                      </p>

                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <div>
                          <label
                            htmlFor="appointment-form-time"
                            className="mb-1.5 block text-sm font-semibold text-amber-900"
                          >
                            Approximate time <span className="text-clinic-clay">*</span>
                          </label>
                          <input
                            id="appointment-form-time"
                            type="time"
                            value={form.time}
                            onChange={(event) =>
                              setForm({ ...form, time: event.target.value })
                            }
                            className="w-full rounded-xl border border-amber-300 bg-white px-3 py-3 text-sm outline-none focus:border-clinic-teal focus:ring-4 focus:ring-clinic-teal/10"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor="appointment-urgent-reason"
                            className="mb-1.5 block text-sm font-semibold text-amber-900"
                          >
                            Urgency reason <span className="text-clinic-clay">*</span>
                          </label>
                          <input
                            id="appointment-urgent-reason"
                            type="text"
                            value={form.reason}
                            onChange={(event) =>
                              setForm({ ...form, reason: event.target.value })
                            }
                            placeholder="e.g. Severe tooth pain or swelling"
                            className="w-full rounded-xl border border-amber-300 bg-white px-3 py-3 text-sm text-amber-900 outline-none placeholder:text-amber-700/50 focus:border-clinic-teal focus:ring-4 focus:ring-clinic-teal/10"
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 space-y-4">
                      <SlotGroup
                        label="Morning · 10:00 AM - 3:00 PM"
                        slots={availableMorningSlots}
                        selectedTime={form.time}
                        onSelect={(time) => setForm({ ...form, time })}
                      />
                      <SlotGroup
                        label="Evening · 5:00 PM - 10:00 PM"
                        slots={availableEveningSlots}
                        selectedTime={form.time}
                        onSelect={(time) => setForm({ ...form, time })}
                      />
                      {daySlots.length === 0 && (
                        <p className="rounded-xl border border-dashed border-clinic-line bg-white px-4 py-4 text-sm text-clinic-ink/55">
                          No regular appointment slots are available for this date.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {!selectedDateIsSunday && (
              <div>
                <label
                  htmlFor="appointment-reason"
                  className="mb-1.5 block text-sm font-semibold text-clinic-ink"
                >
                  {selectedDateIsSunday ? 'Urgency reason' : 'Reason for visit'}{' '}
                  <span className="text-clinic-clay">*</span>
                </label>

                <input
                  id="appointment-reason"
                  type="text"
                  value={form.reason}
                  onChange={(event) =>
                    setForm({ ...form, reason: event.target.value })
                  }
                  placeholder="e.g. Consultation, Cleaning, Root canal follow-up"
                  maxLength={500}
                  className="w-full rounded-xl border border-clinic-line bg-clinic-paper px-3 py-3 text-sm text-clinic-ink outline-none placeholder:text-clinic-ink/40 focus:border-clinic-teal focus:ring-4 focus:ring-clinic-teal/10"
                />
              </div>
              )}

              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="appointment-disease"
                    className="mb-1.5 block text-sm font-semibold text-clinic-ink"
                  >
                    Main dental concern
                  </label>

                  <input
                    id="appointment-disease"
                    type="text"
                    value={form.disease}
                    onChange={(event) =>
                      setForm({ ...form, disease: event.target.value })
                    }
                    placeholder="e.g. Tooth pain, cavity, gum swelling"
                    maxLength={500}
                    className="w-full rounded-xl border border-clinic-line bg-clinic-paper px-3 py-3 text-sm text-clinic-ink outline-none placeholder:text-clinic-ink/40 focus:border-clinic-teal focus:ring-4 focus:ring-clinic-teal/10"
                  />
                </div>

                <div>
                  <label
                    htmlFor="appointment-visits"
                    className="mb-1.5 block text-sm font-semibold text-clinic-ink"
                  >
                    Expected visits
                  </label>

                  <input
                    id="appointment-visits"
                    type="text"
                    inputMode="numeric"
                    min="1"
                    max="50"
                    value={form.requiredVisits}
                    onChange={(event) =>
                      setForm({ ...form, requiredVisits: event.target.value })
                    }
                    className="w-full rounded-xl border border-clinic-line bg-clinic-paper px-3 py-3 text-sm text-clinic-ink outline-none focus:border-clinic-teal focus:ring-4 focus:ring-clinic-teal/10"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="planned-treatments"
                  className="mb-1.5 block text-sm font-semibold text-clinic-ink"
                >
                  Planned treatments
                </label>

                <textarea
                  id="planned-treatments"
                  value={form.plannedTreatments}
                  onChange={(event) =>
                    setForm({ ...form, plannedTreatments: event.target.value })
                  }
                  rows={2}
                  maxLength={2000}
                  placeholder="List one or more planned treatments"
                  className="w-full resize-none rounded-xl border border-clinic-line bg-clinic-paper px-3 py-3 text-sm text-clinic-ink outline-none placeholder:text-clinic-ink/40 focus:border-clinic-teal focus:ring-4 focus:ring-clinic-teal/10"
                />
              </div>

              <div>
                <label
                  htmlFor="appointment-notes"
                  className="mb-1.5 block text-sm font-semibold text-clinic-ink"
                >
                  Notes
                </label>

                <textarea
                  id="appointment-notes"
                  value={form.notes}
                  onChange={(event) =>
                    setForm({ ...form, notes: event.target.value })
                  }
                  rows={3}
                  maxLength={5000}
                  placeholder="Optional appointment notes..."
                  className="w-full resize-none rounded-xl border border-clinic-line bg-clinic-paper px-3 py-3 text-sm text-clinic-ink outline-none placeholder:text-clinic-ink/40 focus:border-clinic-teal focus:ring-4 focus:ring-clinic-teal/10"
                />
              </div>

              {formError && (
                <div
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
                >
                  {formError}
                </div>
              )}

              <div className="flex flex-col-reverse gap-3 border-t border-clinic-line pt-5 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeForm}
                  className="rounded-xl border border-clinic-line px-5 py-3 text-sm font-semibold text-clinic-ink/70 hover:bg-clinic-paper"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={patients.length === 0}
                  className="rounded-xl bg-clinic-teal px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-clinic-teal/90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {editingId ? 'Save changes' : 'Book appointment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
