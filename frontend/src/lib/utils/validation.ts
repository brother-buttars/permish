export function validateEmail(email: string): boolean {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validatePhone(phone: string): boolean {
	if (!phone) return true;
	return /^[\d\s\-().+]{7,15}$/.test(phone);
}

export function validateDate(date: string): boolean {
	return /^\d{4}-\d{2}-\d{2}$/.test(date) && !isNaN(Date.parse(date));
}
