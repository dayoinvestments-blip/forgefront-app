import { configureStore, createSlice, PayloadAction } from '@reduxjs/toolkit';

// ─── Auth Slice ───────────────────────────────────────────────────────────────
interface AuthState {
  user: { id: string; name: string; email: string; company: string } | null;
  token: string | null;
  isLoading: boolean;
}
const authSlice = createSlice({
  name: 'auth',
  initialState: { user: null, token: null, isLoading: false } as AuthState,
  reducers: {
    setUser: (state, action: PayloadAction<AuthState['user']>) => { state.user = action.payload; },
    setToken: (state, action: PayloadAction<string>) => { state.token = action.payload; },
    setLoading: (state, action: PayloadAction<boolean>) => { state.isLoading = action.payload; },
    logout: (state) => { state.user = null; state.token = null; },
  },
});

// ─── Subscription Slice ───────────────────────────────────────────────────────
interface SubState {
  tier: 'free' | 'base' | 'pro';
  expiresAt: string | null;
  isActive: boolean;
}
const subSlice = createSlice({
  name: 'subscription',
  initialState: { tier: 'free', expiresAt: null, isActive: false } as SubState,
  reducers: {
    setSubscription: (state, action: PayloadAction<SubState>) => Object.assign(state, action.payload),
    clearSubscription: (state) => { state.tier = 'free'; state.expiresAt = null; state.isActive = false; },
  },
});

// ─── Contracts Slice ──────────────────────────────────────────────────────────
export interface Contract {
  id: string;
  title: string;
  agency: string;
  value: number;
  naicsCode: string;
  setAside: string;
  dueDate: string;
  status: 'open' | 'bidding' | 'closed' | 'awarded';
  location: string;
  solicitionNumber: string;
  description: string;
}
interface ContractsState {
  items: Contract[];
  isLoading: boolean;
  lastFetched: string | null;
  filters: { naics: string[]; setAside: string; minValue: number; maxValue: number };
}
const contractsSlice = createSlice({
  name: 'contracts',
  initialState: {
    items: [], isLoading: false, lastFetched: null,
    filters: { naics: ['332312'], setAside: 'SDVOSB', minValue: 0, maxValue: 10000000 },
  } as ContractsState,
  reducers: {
    setContracts: (state, action: PayloadAction<Contract[]>) => { state.items = action.payload; state.lastFetched = new Date().toISOString(); },
    setLoading: (state, action: PayloadAction<boolean>) => { state.isLoading = action.payload; },
    setFilters: (state, action: PayloadAction<Partial<ContractsState['filters']>>) => { Object.assign(state.filters, action.payload); },
  },
});

// ─── Jobs Slice ───────────────────────────────────────────────────────────────
export interface Job {
  id: string;
  name: string;
  client: string;
  value: number;
  status: 'active' | 'pending' | 'review' | 'complete';
  phase: string;
  startDate: string;
  estimatedEnd: string;
  invoiced: number;
  notes: string;
}
const jobsSlice = createSlice({
  name: 'jobs',
  initialState: { items: [] as Job[], isLoading: false },
  reducers: {
    setJobs: (state, action: PayloadAction<Job[]>) => { state.items = action.payload; },
    addJob: (state, action: PayloadAction<Job>) => { state.items.push(action.payload); },
    updateJob: (state, action: PayloadAction<Partial<Job> & { id: string }>) => {
      const idx = state.items.findIndex(j => j.id === action.payload.id);
      if (idx !== -1) Object.assign(state.items[idx], action.payload);
    },
  },
});

// ─── Invoices Slice ───────────────────────────────────────────────────────────
export interface InvoiceLineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  jobId: string;
  jobName: string;
  client: string;
  clientEmail: string;
  clientAddress: string;
  issueDate: string;
  dueDate: string;
  lineItems: InvoiceLineItem[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  status: 'draft' | 'sent' | 'paid' | 'overdue';
  notes: string;
}

const invoicesSlice = createSlice({
  name: 'invoices',
  initialState: { items: [] as Invoice[], isLoading: false },
  reducers: {
    addInvoice: (state, action: PayloadAction<Invoice>) => { state.items.unshift(action.payload); },
    updateInvoice: (state, action: PayloadAction<Partial<Invoice> & { id: string }>) => {
      const idx = state.items.findIndex(i => i.id === action.payload.id);
      if (idx !== -1) Object.assign(state.items[idx], action.payload);
    },
    deleteInvoice: (state, action: PayloadAction<string>) => {
      state.items = state.items.filter(i => i.id !== action.payload);
    },
  },
});

export const store = configureStore({
  reducer: {
    auth: authSlice.reducer,
    subscription: subSlice.reducer,
    contracts: contractsSlice.reducer,
    jobs: jobsSlice.reducer,
    invoices: invoicesSlice.reducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
export const { setUser, setToken, logout } = authSlice.actions;
export const { setSubscription, clearSubscription } = subSlice.actions;
export const { setContracts, setFilters } = contractsSlice.actions;
export const { setJobs, addJob, updateJob } = jobsSlice.actions;
export const { addInvoice, updateInvoice, deleteInvoice } = invoicesSlice.actions;
