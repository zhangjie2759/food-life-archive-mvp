import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'

Object.defineProperty(window, 'confirm', { writable: true, value: () => true })
Object.defineProperty(URL, 'createObjectURL', { writable: true, value: () => 'blob:test' })
Object.defineProperty(URL, 'revokeObjectURL', { writable: true, value: () => undefined })
