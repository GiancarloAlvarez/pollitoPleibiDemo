const CART_KEY = 'pollito-cart';

const listeners = new Set();

export const state = {
  user: null,
  isLogged: false,
  role: 'admin',
  view: 'login',
  route: { base: 'login', parts: [], query: {} },
  theme: 'light',
  cart: [],
  products: [],
  orders: [],
  inventory: [],
  users: [],
  suppliers: [],
  movements: [],
  settings: {},
  filters: {
    posCategory: 'Todos',
    posSearch: '',
    productsSearch: '',
    productsCategory: 'Todos',
    inventorySearch: '',
    reportPeriod: 'today',
    reportFrom: '',
    reportTo: '',
    configTab: 'business',
  },
  sync: { state: 'local', pending: 0, lastSync: null, message: 'Modo local' },
  drawer: false,
  menuOpen: null,
};

export const store = {
  getState() {
    return state;
  },
  setState(patch) {
    Object.assign(state, patch);
    listeners.forEach(listener => listener(state));
  },
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function loadCart() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch (error) {
    return null;
  }
}

export function saveCart(cart) {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(cart || []));
  } catch (error) {
    return false;
  }
  return true;
}

export function setCart(cart) {
  state.cart = cart || [];
  saveCart(state.cart);
  store.setState({ cart: state.cart });
}

export function setFilter(key, value) {
  state.filters = { ...state.filters, [key]: value };
  store.setState({ filters: state.filters });
}

export function clearFilters() {
  state.filters = {
    ...state.filters,
    posSearch: '',
    posCategory: 'Todos',
    productsSearch: '',
    productsCategory: 'Todos',
    inventorySearch: '',
  };
  store.setState({ filters: state.filters });
}
