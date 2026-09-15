const INDIA_COUNTRY_CODE = '91'

export function normalizeWhatsAppPhone(value: string) {
  let digits = value.replace(/\D/g, '')

  if (digits.startsWith('00')) {
    digits = digits.slice(2)
  }

  if (digits.length === 10) {
    digits = `${INDIA_COUNTRY_CODE}${digits}`
  } else if (digits.length === 11 && digits.startsWith('0')) {
    digits = `${INDIA_COUNTRY_CODE}${digits.slice(1)}`
  }

  return digits.length >= 8 && digits.length <= 15 ? digits : ''
}

export function getWhatsAppUrl(phone: string, message: string) {
  const normalizedPhone = normalizeWhatsAppPhone(phone)

  if (!normalizedPhone) {
    return undefined
  }

  return `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`
}