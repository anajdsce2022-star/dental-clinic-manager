import { useEffect, useState, type FormEvent } from 'react'
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

function getAge(dateOfBirth: string) {
  if (!dateOfBirth) {
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
  return new Date().toISOString().split('T')[0]
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
  const [patients, setPatients] = useState<Patient[]>([])
  const [appointments, setAppointments] = useState<PatientAppointment[]>([])
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyPatient)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)

    if (saved) {
      try {
        setPatients(JSON.parse(saved))
      } catch {
        setPatients([])
      }
    }

    const savedAppointments = localStorage.getItem(APPOINTMENTS_STORAGE_KEY)

    if (savedAppointments) {
      try {
        setAppointments(JSON.parse(savedAppointments))
      } catch {
        setAppointments([])
      }
    }
  }, [])

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

    if (getAge(form.dateOfBirth) === null) {
      setFormError('Enter a valid date of birth that is not in the future.')
      return
    }

    if (editingId) {
      const updated = patients.map((patient) =>
        patient.id === editingId
          ? { ...patient, ...form }
          : patient,
      )

      savePatients(updated)
    } else {
      const newPatient: Patient = {
        id: crypto.randomUUID(),
        ...form,
        createdAt: new Date().toISOString(),
      }

      savePatients([...patients, newPatient])
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
                      ) : (
                        <button
                          onClick={() => navigate(`/appointments?patientId=${patient.id}`)}
                          className="mr-3 text-sm font-medium text-clinic-teal hover:underline"
                        >
                          Book appointment
                        </button>
                      )}

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
                  value={form.address}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      address: event.target.value,
                    })
                  }
                  rows={3}
                  className="mt-2 w-full rounded-xl border border-clinic-line bg-clinic-paper px-3 py-2.5 text-sm outline-none focus:border-clinic-teal"
                />
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <FormField
                  label="Allergies"
                  value={form.allergies}
                  onChange={(value) =>
                    setForm({ ...form, allergies: value })
                  }
                  placeholder="e.g. Penicillin, latex, none"
                />

                <FormField
                  label="Medical notes"
                  value={form.medicalNotes}
                  onChange={(value) =>
                    setForm({ ...form, medicalNotes: value })
                  }
                  placeholder="Optional notes for the care team"
                />
              </div>

              {formError && (
                <p className="text-sm text-clinic-clay" role="alert">
                  {formError}
                </p>
              )}

              <div className="flex justify-end gap-3 border-t border-clinic-line pt-5">
                <button
                  type="button"
                  onClick={closeForm}
                  className="rounded-xl border border-clinic-line px-4 py-2.5 text-sm font-medium"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="rounded-xl bg-clinic-teal px-4 py-2.5 text-sm font-semibold text-white"
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
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  required?: boolean
  placeholder?: string
}) {
  return (
    <div>
      <label className="text-sm font-medium">
        {label}
      </label>

      <input
        type={type}
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-xl border border-clinic-line bg-clinic-paper px-3 py-2.5 text-sm outline-none focus:border-clinic-teal"
      />
    </div>
  )
}