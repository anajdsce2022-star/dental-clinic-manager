import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { getWhatsAppUrl } from '../../lib/whatsapp'

type Patient = {
  id: string
  name: string
  phone: string
  email: string
  dateOfBirth: string
  gender: string
  address: string
  emergencyContact: string
  bloodGroup: string
  allergies: string
  medicalNotes: string
  createdAt: string
}

type PatientAppointment = {
  id: string
  patientId: string
  patientName: string
  date: string
  time: string
  status: 'Scheduled' | 'Under treatment' | 'Completed' | 'Cancelled' | 'No show'
}

const STORAGE_KEY = 'joshi-dental-clinic-patients'
const APPOINTMENTS_STORAGE_KEY = 'joshi-dental-clinic-appointments'
const PREPONEMENT_NUMBER = '7090763509'
const MAX_NAME_LENGTH = 200
const MAX_EMAIL_LENGTH = 254
const MAX_ADDRESS_LENGTH = 1000
const MAX_ALLERGIES_LENGTH = 2000
const MAX_MEDICAL_NOTES_LENGTH = 5000

const LINKED_RECORD_KEYS = [
  APPOINTMENTS_STORAGE_KEY,
  'joshi-dental-clinic-treatments',
  'joshi-dental-clinic-invoices',
]

const emptyPatient = {
  name: '',
  phone: '',
  email: '',
  dateOfBirth: '',
  gender: '',
  address: '',
  emergencyContact: '',
  bloodGroup: '',
  allergies: '',
  medicalNotes: '',
}

function loadPatients(): Patient[] {
  const saved = localStorage.getItem(STORAGE_KEY)

  if (!saved) return []

  try {
    const parsed = JSON.parse(saved)
    if (!Array.isArray(parsed)) return []

    const seenIds = new Set<string>()
    return parsed.filter((patient): patient is Patient => {
      if (!patient || typeof patient !== 'object') return false
      const record = patient as Partial<Patient>
      if (typeof record.id !== 'string' || !record.id.trim()) return false
      if (typeof record.name !== 'string') return false
      if (typeof record.phone !== 'string') return false
      if (typeof record.email !== 'string') return false
      if (typeof record.dateOfBirth !== 'string') return false
      if (typeof record.gender !== 'string') return false
      if (typeof record.address !== 'string') return false
      if (typeof record.emergencyContact !== 'string') return false
      if (typeof record.bloodGroup !== 'string') return false
      if (typeof record.allergies !== 'string') return false
      if (typeof record.medicalNotes !== 'string') return false
      if (typeof record.createdAt !== 'string') return false
      if (seenIds.has(record.id)) return false
      seenIds.add(record.id)
      return true
    })
  } catch {
    return []
  }
}

function isAppointmentStatus(value: unknown): value is PatientAppointment['status'] {
  return (
    value === 'Scheduled' ||
    value === 'Under treatment' ||
    value === 'Completed' ||
    value === 'Cancelled' ||
    value === 'No show'
  )
}

function isValidDateString(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false
  }

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

function loadAppointments(): PatientAppointment[] {
  const savedAppointments = localStorage.getItem(APPOINTMENTS_STORAGE_KEY)

  if (!savedAppointments) return []

  try {
    const parsed = JSON.parse(savedAppointments)
    if (!Array.isArray(parsed)) return []

    const seenIds = new Set<string>()

    return parsed.filter((appointment): appointment is PatientAppointment => {
      if (!appointment || typeof appointment !== 'object') return false
      const record = appointment as Partial<PatientAppointment>

      if (typeof record.id !== 'string' || !record.id.trim()) return false
      if (typeof record.patientId !== 'string' || !record.patientId.trim()) return false
      if (typeof record.patientName !== 'string') return false
      if (!isValidDateString(record.date)) return false
      if (!isValidTimeString(record.time)) return false
      if (typeof record.status !== 'string' || !isAppointmentStatus(record.status)) return false
      if (seenIds.has(record.id)) return false

      seenIds.add(record.id)
      return true
    })
  } catch {
    return []
  }
}

function updateLinkedPatientNames(patientId: string, name: string) {
  LINKED_RECORD_KEYS.forEach((key) => {
    try {
      const saved = localStorage.getItem(key)

      if (!saved) return

      const records = JSON.parse(saved)

      if (!Array.isArray(records)) return

      localStorage.setItem(
        key,
        JSON.stringify(
          records.map((record) =>
            record?.patientId === patientId
              ? { ...record, patientName: name }
              : record,
          ),
        ),
      )
    } catch {
      // Keep the patient edit available if a related dataset is malformed.
    }
  })
}

function hasLinkedPatientRecords(patientId: string) {
  return LINKED_RECORD_KEYS.some((key) => {
    try {
      const saved = localStorage.getItem(key)
      const records = saved ? JSON.parse(saved) : []

      return (
        Array.isArray(records) &&
        records.some((record) => record?.patientId === patientId)
      )
    } catch {
      return false
    }
  })
}

function getAge(dateOfBirth: string) {
  if (!isValidDateString(dateOfBirth)) {
    return null
  }

  const birthDate = new Date(`${dateOfBirth}T00:00:00`)
  const today = new Date()
  let age = today.getFullYear() - birthDate.getFullYear()
  const birthdayHasPassed =
    today.getMonth() > birthDate.getMonth() ||
    (today.getMonth() === birthDate.getMonth() &&
      today.getDate() >= birthDate.getDate())

  if (!birthdayHasPassed) {
    age -= 1
  }

  return age >= 0 ? age : null
}

function getToday() {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function isValidMobileNumber(value: string) {
  return /^[6-9]\d{9}$/.test(value.trim())
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

function formatDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function PatientsPage() {
  const navigate = useNavigate()
  const [patients, setPatients] = useState<Patient[]>(loadPatients)
  const [appointments] = useState<PatientAppointment[]>(loadAppointments)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [newPatientId, setNewPatientId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyPatient)
  const [formError, setFormError] = useState('')

  function savePatients(nextPatients: Patient[]) {
    setPatients(nextPatients)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextPatients))
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()

    if (
      !form.name.trim() ||
      !form.phone.trim() ||
      !form.dateOfBirth ||
      !form.gender
    ) {
      setFormError('Name, mobile number, date of birth, and gender are required.')
      return
    }

    if (!isValidMobileNumber(form.phone)) {
      setFormError('Enter a valid mobile number with 10 digits starting from 6 to 9.')
      return
    }

    if (form.email.trim() && !isValidEmail(form.email)) {
      setFormError('Enter a valid email address.')
      return
    }

    if (
      form.emergencyContact.trim() &&
      !isValidMobileNumber(form.emergencyContact)
    ) {
      setFormError('Enter a valid emergency contact with 10 digits starting from 6 to 9.')
      return
    }

    if (getAge(form.dateOfBirth) === null) {
      setFormError('Enter a valid date of birth that is not in the future.')
      return
    }

    if (form.name.trim().length > MAX_NAME_LENGTH) {
      setFormError(`Name cannot exceed ${MAX_NAME_LENGTH} characters.`)
      return
    }

    if (form.email.trim().length > MAX_EMAIL_LENGTH) {
      setFormError(`Email cannot exceed ${MAX_EMAIL_LENGTH} characters.`)
      return
    }

    if (form.address.trim().length > MAX_ADDRESS_LENGTH) {
      setFormError(`Address cannot exceed ${MAX_ADDRESS_LENGTH} characters.`)
      return
    }

    if (form.allergies.trim().length > MAX_ALLERGIES_LENGTH) {
      setFormError(`Allergies cannot exceed ${MAX_ALLERGIES_LENGTH} characters.`)
      return
    }

    if (form.medicalNotes.trim().length > MAX_MEDICAL_NOTES_LENGTH) {
      setFormError(`Medical notes cannot exceed ${MAX_MEDICAL_NOTES_LENGTH} characters.`)
      return
    }

    const normalizedPhone = form.phone.trim()
    const normalizedEmail = form.email.trim().toLowerCase()
    const normalizedForm = {
      ...form,
      name: form.name.trim(),
      phone: normalizedPhone,
      email: normalizedEmail,
      dateOfBirth: form.dateOfBirth.trim(),
      gender: form.gender.trim(),
      address: form.address.trim(),
      emergencyContact: form.emergencyContact.trim(),
      bloodGroup: form.bloodGroup.trim(),
      allergies: form.allergies.trim(),
      medicalNotes: form.medicalNotes.trim(),
    }
    const duplicate = patients.find(
      (patient) =>
        patient.id !== editingId &&
        (patient.phone.trim() === normalizedPhone ||
          (normalizedEmail &&
            patient.email.trim().toLowerCase() === normalizedEmail)),
    )

    if (duplicate) {
      setFormError('A patient with this mobile number or email already exists.')
      return
    }

    if (editingId) {
      const updated = patients.map((patient) =>
        patient.id === editingId
          ? { ...patient, ...normalizedForm }
          : patient,
      )

      updateLinkedPatientNames(editingId, form.name.trim())
      savePatients(updated)
    } else {
      const newPatient: Patient = {
        id: crypto.randomUUID(),
        ...normalizedForm,
        createdAt: new Date().toISOString(),
      }

      savePatients([...patients, newPatient])
      setNewPatientId(newPatient.id)
    }

    closeForm()
  }

  function startAddPatient() {
    setEditingId(null)
    setForm(emptyPatient)
    setFormError('')
    setShowForm(true)
  }

  function startEditPatient(patient: Patient) {
    setEditingId(patient.id)
    setForm({
      name: patient.name,
      phone: patient.phone,
      email: patient.email,
      dateOfBirth: patient.dateOfBirth,
      gender: patient.gender,
      address: patient.address,
      emergencyContact: patient.emergencyContact || '',
      bloodGroup: patient.bloodGroup || '',
      allergies: patient.allergies || '',
      medicalNotes: patient.medicalNotes || '',
    })
    setFormError('')
    setShowForm(true)
  }

  function deletePatient(id: string) {
    if (hasLinkedPatientRecords(id)) {
      window.alert(
        'This patient cannot be deleted while appointments, treatments, or invoices are linked to the record.',
      )
      return
    }

    const confirmed = window.confirm(
      'Delete this patient record?',
    )

    if (!confirmed) {
      return
    }

    savePatients(
      patients.filter((patient) => patient.id !== id),
    )
  }

  function closeForm() {
    setShowForm(false)
    setEditingId(null)
    setForm(emptyPatient)
    setFormError('')
  }

  function closeNewPatientPrompt() {
    setNewPatientId(null)
  }

  function getActiveAppointment(patientId: string) {
    const today = getToday()

    return appointments
      .filter(
        (appointment) =>
          appointment.patientId === patientId &&
          (appointment.status === 'Scheduled' ||
            appointment.status === 'Under treatment') &&
          appointment.date >= today,
      )
      .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))[0]
  }

  function getPreponementLink(patient: Patient, appointment: PatientAppointment) {
    const message = `Joshi Dental Clinic: Would an earlier appointment be convenient for you? Your current booking is ${formatDate(appointment.date)} at ${appointment.time}. Please call ${PREPONEMENT_NUMBER} if you are ready to reschedule. Booking ID: ${appointment.id}.`

    return getWhatsAppUrl(patient.phone, message)
  }

  const filteredPatients = patients.filter((patient) => {
    const query = search.trim().toLowerCase()
    const phoneQuery = search.replace(/\D/g, '')

    return (
      patient.name.toLowerCase().includes(query) ||
      patient.email.toLowerCase().includes(query) ||
      (phoneQuery.length > 0 &&
        patient.phone.replace(/\D/g, '').includes(phoneQuery))
    )
  })

  return (
    <section>
      <div>
        <div>
          <p className="text-sm font-medium text-clinic-teal">
            Patient records
          </p>

          <h1 className="mt-1 font-display text-4xl font-semibold">
            Patients
          </h1>

          <p className="mt-2 text-sm text-clinic-ink/55">
            Search and manage patient records.
          </p>
        </div>

        <div className="mt-6 rounded-2xl border border-clinic-line bg-white p-3 shadow-sm sm:p-4">
          <div className="mb-3 flex items-center justify-between px-1">
            <div className="text-xs font-semibold uppercase tracking-widest text-clinic-ink/45">
              Patient directory
            </div>

            <div className="rounded-full bg-clinic-paper px-2.5 py-1 text-xs font-medium text-clinic-teal">
              {patients.length} {patients.length === 1 ? 'record' : 'records'}
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              onClick={startAddPatient}
              className="order-first rounded-xl bg-clinic-teal px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-clinic-teal/90 focus:outline-none focus:ring-2 focus:ring-clinic-teal focus:ring-offset-2 sm:shrink-0"
            >
              + New patient
            </button>

            <div className="relative min-w-0 flex-1">
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by name, mobile number or email..."
                aria-label="Search patients by name, mobile number or email"
                className="w-full rounded-xl border-2 border-clinic-teal/25 bg-clinic-paper px-4 py-4 text-sm text-clinic-ink outline-none transition placeholder:text-clinic-ink/45 focus:border-clinic-teal focus:ring-4 focus:ring-clinic-teal/15"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-clinic-line bg-white p-3 shadow-sm sm:p-5">

        {filteredPatients.length === 0 ? (
          <div className="rounded-xl border border-dashed border-clinic-teal/25 bg-clinic-paper px-6 py-14 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-clinic-teal text-lg font-semibold text-white">
              P
            </div>

            <div className="mt-4 font-display text-xl font-semibold">
              {search ? 'No patients found' : 'No patients yet'}
            </div>

            <p className="mt-2 text-sm text-clinic-ink/45">
              {search
                ? 'Try a different search.'
                : 'Add your first test patient to begin.'}
            </p>
          </div>
        ) : (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-clinic-line text-xs uppercase tracking-wide text-clinic-ink/40">
                  <th className="px-3 py-3">Patient</th>
                  <th className="px-3 py-3">Mobile number</th>
                  <th className="px-3 py-3">Date of birth</th>
                  <th className="px-3 py-3">Age</th>
                  <th className="px-3 py-3 text-right">Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredPatients.map((patient) => {
                  const appointment = getActiveAppointment(patient.id)
                  const isFutureAppointment = Boolean(
                    appointment && appointment.date > getToday(),
                  )

                  return (
                  <tr
                    key={patient.id}
                    className="border-b border-clinic-line last:border-0"
                  >
                    <td className="px-3 py-4 font-medium">
                      {patient.name}
                    </td>

                    <td className="px-3 py-4 text-clinic-ink/60">
                      {patient.phone}
                    </td>

                    <td className="px-3 py-4 text-clinic-ink/60">
                      {patient.dateOfBirth || '—'}
                    </td>

                    <td className="px-3 py-4 text-clinic-ink/60">
                      {getAge(patient.dateOfBirth) ?? '—'}
                    </td>

                    <td className="px-3 py-4 text-right">
                      <button
                        onClick={() => navigate(`/appointments?patientId=${patient.id}`)}
                        className="mr-3 text-sm font-medium text-clinic-teal hover:underline"
                      >
                        Book Appointment
                      </button>

                      {appointment ? (
                        <>
                          <button
                            onClick={() => navigate(`/appointments?appointmentId=${appointment.id}`)}
                            className="mr-3 text-sm font-medium text-clinic-teal hover:underline"
                          >
                            View booking
                          </button>

                          {isFutureAppointment && (
                            <a
                              href={getPreponementLink(patient, appointment)}
                              target="_blank"
                              rel="noreferrer"
                              className="mr-3 text-sm font-medium text-clinic-clay hover:underline"
                            >
                              Request earlier slot
                            </a>
                          )}
                        </>
                      ) : null}

                      <button
                        onClick={() => startEditPatient(patient)}
                        className="mr-3 text-sm font-medium text-clinic-teal hover:underline"
                      >
                        Edit
                      </button>

                      <button
                        onClick={() => deletePatient(patient.id)}
                        className="text-sm font-medium text-clinic-clay hover:underline"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {newPatientId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded-2xl border-2 border-clinic-teal/25 bg-white p-6 shadow-xl ring-4 ring-clinic-teal/10">
            <p className="text-xs font-semibold uppercase tracking-widest text-clinic-teal">
              Patient added successfully
            </p>

            <h2 className="mt-2 font-display text-2xl font-semibold text-clinic-ink">
              Would you like to book an appointment now?
            </h2>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeNewPatientPrompt}
                className="rounded-xl border border-clinic-line px-4 py-3 text-sm font-semibold text-clinic-ink/70 hover:bg-clinic-paper"
              >
                Done
              </button>

              <button
                type="button"
                onClick={() => {
                  const patientId = newPatientId
                  closeNewPatientPrompt()
                  navigate(`/appointments?patientId=${patientId}`)
                }}
                className="rounded-xl bg-clinic-teal px-4 py-3 text-sm font-semibold text-white hover:bg-clinic-teal/90"
              >
                Book Appointment
              </button>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border-2 border-clinic-teal/35 bg-white p-6 shadow-xl ring-4 ring-clinic-teal/10">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-display text-2xl font-semibold">
                  {editingId ? 'Edit patient' : 'Add patient'}
                </h2>

                <p className="mt-1 text-sm text-clinic-ink/50">
                  Enter basic patient information.
                </p>
              </div>

              <button
                type="button"
                onClick={closeForm}
                aria-label="Close patient form"
                className="text-xl text-clinic-ink/40 hover:text-clinic-ink"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-6 space-y-5">
              <div className="grid gap-5 md:grid-cols-2">
                <FormField
                  label="Full name"
                  value={form.name}
                  onChange={(value) =>
                    setForm({ ...form, name: value })
                  }
                  required
                />

                <FormField
                  label="Mobile number"
                  value={form.phone}
                  onChange={(value) =>
                    setForm({ ...form, phone: value })
                  }
                  required
                />

                <FormField
                  label="Email"
                  value={form.email}
                  onChange={(value) =>
                    setForm({ ...form, email: value })
                  }
                />

                <FormField
                  label="Date of birth"
                  type="date"
                  value={form.dateOfBirth}
                  onChange={(value) =>
                    setForm({ ...form, dateOfBirth: value })
                  }
                  required
                />

                <div>
                  <label className="text-sm font-medium">
                    Gender
                  </label>

                  <select
                    value={form.gender}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        gender: event.target.value,
                      })
                    }
                    className="mt-2 w-full rounded-xl border border-clinic-line bg-clinic-paper px-3 py-2.5 text-sm outline-none focus:border-clinic-teal"
                    required
                  >
                    <option value="">Select</option>
                    <option value="Female">Female</option>
                    <option value="Male">Male</option>
                    <option value="Other">Other</option>
                    <option value="Prefer not to say">
                      Prefer not to say
                    </option>
                  </select>
                </div>

                <FormField
                  label="Emergency contact"
                  value={form.emergencyContact}
                  onChange={(value) =>
                    setForm({ ...form, emergencyContact: value })
                  }
                />

                <div>
                  <label className="text-sm font-medium">Blood group</label>

                  <select
                    value={form.bloodGroup}
                    onChange={(event) =>
                      setForm({ ...form, bloodGroup: event.target.value })
                    }
                    className="mt-2 w-full rounded-xl border border-clinic-line bg-clinic-paper px-3 py-2.5 text-sm outline-none focus:border-clinic-teal"
                  >
                    <option value="">Select</option>
                    <option value="A+">A+</option>
                    <option value="A-">A-</option>
                    <option value="B+">B+</option>
                    <option value="B-">B-</option>
                    <option value="AB+">AB+</option>
                    <option value="AB-">AB-</option>
                    <option value="O+">O+</option>
                    <option value="O-">O-</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium">
                  Address
                </label>
                <textarea
                  rows={3}
                  value={form.address}
                  onChange={(event) =>
                    setForm({ ...form, address: event.target.value })
                  }
                  placeholder="Enter patient address..."
                  className="mt-2 w-full rounded-xl border border-clinic-line bg-clinic-paper px-3 py-2.5 text-sm outline-none focus:border-clinic-teal"
                />
              </div>

              <div>
                <label className="text-sm font-medium">
                  Allergies
                </label>
                <textarea
                  rows={3}
                  value={form.allergies}
                  onChange={(event) =>
                    setForm({ ...form, allergies: event.target.value })
                  }
                  placeholder="Record known allergies..."
                  className="mt-2 w-full rounded-xl border border-clinic-line bg-clinic-paper px-3 py-2.5 text-sm outline-none focus:border-clinic-teal"
                />
              </div>

              <div>
                <label className="text-sm font-medium">
                  Medical notes
                </label>
                <textarea
                  rows={4}
                  value={form.medicalNotes}
                  onChange={(event) =>
                    setForm({ ...form, medicalNotes: event.target.value })
                  }
                  placeholder="Add relevant medical notes..."
                  className="mt-2 w-full rounded-xl border border-clinic-line bg-clinic-paper px-3 py-2.5 text-sm outline-none focus:border-clinic-teal"
                />
              </div>

              {formError && (
                <div
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
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
                  className="rounded-xl bg-clinic-teal px-5 py-3 text-sm font-semibold text-white hover:bg-clinic-teal/90"
                >
                  {editingId ? 'Save changes' : 'Add patient'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  )
}

function FormField({
  label,
  value,
  onChange,
  type = 'text',
  required = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  required?: boolean
}) {
  return (
    <div>
      <label className="text-sm font-medium">
        {label}
        {required && <span className="ml-1 text-clinic-clay">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        className="mt-2 w-full rounded-xl border border-clinic-line bg-clinic-paper px-3 py-2.5 text-sm outline-none focus:border-clinic-teal"
      />
    </div>
  )
}
