import { useState, useMemo } from 'react';
import { useStore } from '../store/StoreContext';
import { generateId, todayStr } from '../utils/storage';
import { Card, Button, Modal, PageHeader, EmptyState, TabBar, Badge } from '../components/ui';
import {
  Plus,
  Wallet,
  TrendingUp,
  TrendingDown,
  PiggyBank,
  Trash2,
  Edit3,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

const EXPENSE_CATEGORIES = [
  'food',
  'transport',
  'housing',
  'utilities',
  'health',
  'entertainment',
  'education',
  'shopping',
  'subscriptions',
  'other',
];
const INCOME_CATEGORIES = ['salary', 'freelance', 'investment', 'gift', 'other'];
const PIE_COLORS = [
  '#f43f5e',
  '#f59e0b',
  '#22c55e',
  '#38bdf8',
  '#a855f7',
  '#06b6d4',
  '#ec4899',
  '#84cc16',
  '#f97316',
  '#6366f1',
];

export default function MoneyPage() {
  const { state, dispatch } = useStore();
  const today = todayStr();
  const currentMonth = today.slice(0, 7);
  const [tab, setTab] = useState('overview');
  const [showTransForm, setShowTransForm] = useState(false);
  const [showSavingsForm, setShowSavingsForm] = useState(false);
  const [editingTrans, setEditingTrans] = useState(null);

  // Transaction form
  const [transType, setTransType] = useState('expense');
  const [transAmount, setTransAmount] = useState('');
  const [transDesc, setTransDesc] = useState('');
  const [transCat, setTransCat] = useState('food');
  const [transDate, setTransDate] = useState(today);

  // Savings form
  const [savingsName, setSavingsName] = useState('');
  const [savingsTarget, setSavingsTarget] = useState('');
  const [savingsCurrent, setSavingsCurrent] = useState('');

  const transactions = state.transactions || [];
  const savingsGoals = state.savingsGoals || [];

  const monthTransactions = useMemo(
    () => transactions.filter((t) => t.date.startsWith(currentMonth)),
    [transactions, currentMonth]
  );

  const monthIncome = useMemo(
    () =>
      monthTransactions
        .filter((t) => t.type === 'income')
        .reduce((s, t) => s + t.amount, 0),
    [monthTransactions]
  );

  const monthExpenses = useMemo(
    () =>
      monthTransactions
        .filter((t) => t.type === 'expense')
        .reduce((s, t) => s + t.amount, 0),
    [monthTransactions]
  );

  const expenseByCategory = useMemo(() => {
    const map = {};
    monthTransactions
      .filter((t) => t.type === 'expense')
      .forEach((t) => {
        map[t.category] = (map[t.category] || 0) + t.amount;
      });
    return Object.entries(map).map(([name, value], i) => ({
      name,
      value,
      color: PIE_COLORS[i % PIE_COLORS.length],
    }));
  }, [monthTransactions]);

  // Monthly trend — last 6 months
  const monthlyTrend = useMemo(() => {
    const months = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const m = `${year}-${month}`;
      const income = transactions
        .filter((t) => t.type === 'income' && t.date.startsWith(m))
        .reduce((s, t) => s + t.amount, 0);
      const expenses = transactions
        .filter((t) => t.type === 'expense' && t.date.startsWith(m))
        .reduce((s, t) => s + t.amount, 0);
      months.push({ month: m.slice(5), income, expenses });
    }
    return months;
  }, [transactions]);

  function openAddTransaction() {
    setEditingTrans(null);
    setTransType('expense');
    setTransAmount('');
    setTransDesc('');
    setTransCat('food');
    setTransDate(today);
    setShowTransForm(true);
  }

  function openEditTransaction(t) {
    setEditingTrans(t);
    setTransType(t.type);
    setTransAmount(String(t.amount));
    setTransDesc(t.description);
    setTransCat(t.category);
    setTransDate(t.date);
    setShowTransForm(true);
  }

  function saveTransaction() {
    if (!transAmount || !transDesc.trim()) return;
    const parsedAmount = parseFloat(transAmount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) return;

    if (editingTrans) {
      dispatch({
        type: 'UPDATE_TRANSACTION',
        payload: {
          id: editingTrans.id,
          type: transType,
          amount: parsedAmount,
          description: transDesc.trim(),
          category: transCat,
          date: transDate,
        },
      });
    } else {
      dispatch({
        type: 'ADD_TRANSACTION',
        payload: {
          id: generateId(),
          type: transType,
          amount: parsedAmount,
          description: transDesc.trim(),
          category: transCat,
          date: transDate,
          createdAt: new Date().toISOString(),
        },
      });
    }

    setEditingTrans(null);
    setTransAmount('');
    setTransDesc('');
    setTransDate(today);
    setShowTransForm(false);
  }

  function deleteTransaction(id) {
    dispatch({ type: 'DELETE_TRANSACTION', payload: id });
  }

  function saveSavingsGoal() {
    if (!savingsName.trim() || !savingsTarget) return;
    dispatch({
      type: 'ADD_SAVINGS_GOAL',
      payload: {
        id: generateId(),
        name: savingsName.trim(),
        target: parseFloat(savingsTarget),
        current: parseFloat(savingsCurrent) || 0,
        createdAt: new Date().toISOString(),
      },
    });
    setSavingsName('');
    setSavingsTarget('');
    setSavingsCurrent('');
    setShowSavingsForm(false);
  }

  function updateSavingsGoal(goal, addAmount) {
    dispatch({
      type: 'UPDATE_SAVINGS_GOAL',
      payload: { id: goal.id, current: (goal.current || 0) + addAmount },
    });
  }

  const monthName = new Date(currentMonth + '-01T00:00:00').toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Money & Financial Discipline"
        subtitle={`Cash flow, expenditure control, and wealth building for ${monthName}`}
        action={
          <Button size="sm" onClick={openAddTransaction}>
            <Plus size={14} /> Add Transaction
          </Button>
        }
      />

      <TabBar
        tabs={[
          { key: 'overview', label: 'Cash Flow Overview' },
          { key: 'transactions', label: 'Transactions' },
          { key: 'savings', label: 'Savings Goals' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'overview' && (
        <div className="space-y-5">
          {/* Summary Metric Cards (Apple Health Inspired) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <Card className="p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-tertiary)]">
                  Total Income
                </span>
                <div className="w-8 h-8 rounded-xl bg-green-500/15 border border-green-500/25 flex items-center justify-center text-green-400">
                  <ArrowUpRight size={16} />
                </div>
              </div>
              <p className="text-2xl sm:text-3xl font-black text-green-400 font-mono tracking-tight">
                ${monthIncome.toLocaleString()}
              </p>
              <p className="text-xs text-[var(--color-text-tertiary)] mt-1 font-medium">
                Inflows logged this month
              </p>
            </Card>

            <Card className="p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-tertiary)]">
                  Total Expenses
                </span>
                <div className="w-8 h-8 rounded-xl bg-rose-500/15 border border-rose-500/25 flex items-center justify-center text-rose-400">
                  <ArrowDownRight size={16} />
                </div>
              </div>
              <p className="text-2xl sm:text-3xl font-black text-rose-400 font-mono tracking-tight">
                ${monthExpenses.toLocaleString()}
              </p>
              <p className="text-xs text-[var(--color-text-tertiary)] mt-1 font-medium">
                Outflows across all categories
              </p>
            </Card>

            <Card className="p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-tertiary)]">
                  Net Savings
                </span>
                <div className="w-8 h-8 rounded-xl bg-[var(--color-accent-dim)] border border-[var(--color-accent)]/25 flex items-center justify-center text-[var(--color-accent)]">
                  <TrendingUp size={16} />
                </div>
              </div>
              <p
                className={`text-2xl sm:text-3xl font-black font-mono tracking-tight ${
                  monthIncome - monthExpenses >= 0 ? 'text-[var(--color-accent)]' : 'text-rose-400'
                }`}
              >
                ${(monthIncome - monthExpenses).toLocaleString()}
              </p>
              <p className="text-xs text-[var(--color-text-tertiary)] mt-1 font-medium">
                {monthIncome - monthExpenses >= 0 ? 'Positive retained capital' : 'Net deficit'}
              </p>
            </Card>
          </div>

          {/* Expense by Category */}
          {expenseByCategory.length > 0 && (
            <Card className="p-5 sm:p-6">
              <h3 className="font-bold text-base text-[var(--color-text-primary)] mb-1">
                Spending by Category
              </h3>
              <p className="text-xs text-[var(--color-text-tertiary)] mb-5">
                Proportion of expenses allocated across budget buckets
              </p>
              <div className="flex flex-col sm:flex-row items-center gap-6">
                <ResponsiveContainer width={180} height={180}>
                  <PieChart>
                    <Pie
                      data={expenseByCategory}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      innerRadius={52}
                      stroke="rgba(10, 10, 12, 0.8)"
                      strokeWidth={3}
                    >
                      {expenseByCategory.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: 'rgba(20, 20, 25, 0.95)',
                        backdropFilter: 'blur(16px)',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        borderRadius: '12px',
                        fontSize: '12px',
                      }}
                      formatter={(val) => [`$${val.toLocaleString()}`, '']}
                    />
                  </PieChart>
                </ResponsiveContainer>

                <div className="flex-1 w-full space-y-2">
                  {expenseByCategory
                    .sort((a, b) => b.value - a.value)
                    .map((cat) => (
                      <div
                        key={cat.name}
                        className="flex items-center justify-between gap-3 p-2 rounded-xl bg-white/[0.02] border border-white/[0.05]"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-3 h-3 rounded-full" style={{ background: cat.color }} />
                          <span className="text-xs font-bold text-[var(--color-text-primary)] capitalize">
                            {cat.name}
                          </span>
                        </div>
                        <span className="text-xs font-bold font-mono text-[var(--color-text-secondary)]">
                          ${cat.value.toLocaleString()}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            </Card>
          )}

          {/* Monthly Trend */}
          {monthlyTrend.some((m) => m.income > 0 || m.expenses > 0) && (
            <Card className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold text-base text-[var(--color-text-primary)]">
                    6-Month Financial Trend
                  </h3>
                  <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
                    Income vs expenses trajectory
                  </p>
                </div>
                <div className="flex items-center gap-3 text-xs font-semibold">
                  <span className="flex items-center gap-1.5 text-green-400">
                    <span className="w-2 h-2 rounded-full bg-green-400" /> Income
                  </span>
                  <span className="flex items-center gap-1.5 text-rose-400">
                    <span className="w-2 h-2 rounded-full bg-rose-400" /> Expense
                  </span>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={monthlyTrend} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                  <XAxis
                    dataKey="month"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: 'var(--color-text-tertiary)' }}
                  />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={{
                      background: 'rgba(20, 20, 25, 0.95)',
                      backdropFilter: 'blur(16px)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: '12px',
                      fontSize: '12px',
                    }}
                    formatter={(val) => [`$${val.toLocaleString()}`, '']}
                  />
                  <Bar dataKey="income" fill="#22c55e" radius={[6, 6, 0, 0]} maxBarSize={24} />
                  <Bar dataKey="expenses" fill="#f43f5e" radius={[6, 6, 0, 0]} maxBarSize={24} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          )}
        </div>
      )}

      {tab === 'transactions' && (
        <div className="space-y-4">
          {monthTransactions.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="No transactions logged this month"
              description="Track each expense or income event to build disciplined financial awareness."
              action={
                <Button size="sm" onClick={openAddTransaction}>
                  <Plus size={14} /> Add Transaction
                </Button>
              }
            />
          ) : (
            <div className="space-y-2.5">
              {[...monthTransactions]
                .sort(
                  (a, b) =>
                    b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)
                )
                .map((t) => (
                  <Card
                    key={t.id}
                    className="flex items-center gap-3.5 p-3.5 sm:p-4 hover:border-white/[0.18] transition-all"
                  >
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                        t.type === 'income'
                          ? 'bg-green-500/15 border-green-500/25 text-green-400'
                          : 'bg-rose-500/15 border-rose-500/25 text-rose-400'
                      }`}
                    >
                      {t.type === 'income' ? (
                        <ArrowUpRight size={17} strokeWidth={2.2} />
                      ) : (
                        <ArrowDownRight size={17} strokeWidth={2.2} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-[var(--color-text-primary)] truncate">
                        {t.description}
                      </p>
                      <p className="text-xs text-[var(--color-text-tertiary)] capitalize mt-0.5">
                        {t.category} · {t.date}
                      </p>
                    </div>
                    <p
                      className={`text-sm font-black font-mono shrink-0 ${
                        t.type === 'income' ? 'text-green-400' : 'text-rose-400'
                      }`}
                    >
                      {t.type === 'income' ? '+' : '-'}${t.amount.toLocaleString()}
                    </p>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => openEditTransaction(t)}
                        className="w-8 h-8 rounded-xl flex items-center justify-center text-[var(--color-text-tertiary)] hover:text-[var(--color-accent)] hover:bg-white/[0.06] transition-colors"
                        title="Edit transaction"
                      >
                        <Edit3 size={15} />
                      </button>
                      <button
                        onClick={() => deleteTransaction(t.id)}
                        className="w-8 h-8 rounded-xl flex items-center justify-center text-[var(--color-text-tertiary)] hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                        title="Delete transaction"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </Card>
                ))}
            </div>
          )}
        </div>
      )}

      {tab === 'savings' && (
        <div className="space-y-4">
          <Button size="sm" onClick={() => setShowSavingsForm(true)}>
            <Plus size={14} /> New Savings Goal
          </Button>

          {savingsGoals.length === 0 ? (
            <EmptyState
              icon={PiggyBank}
              title="No savings goals established"
              description="Define a target for your emergency fund, investment bucket, or major personal milestone."
              action={
                <Button size="sm" onClick={() => setShowSavingsForm(true)}>
                  <Plus size={14} /> Create Goal
                </Button>
              }
            />
          ) : (
            <div className="space-y-3.5">
              {savingsGoals.map((g) => {
                const pct = g.target
                  ? Math.min(100, Math.round(((g.current || 0) / g.target) * 100))
                  : 0;
                return (
                  <Card key={g.id} className="p-5">
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-bold text-sm sm:text-base text-[var(--color-text-primary)]">
                        {g.name}
                      </p>
                      <Badge color={pct >= 100 ? '#22c55e' : 'var(--color-accent)'}>
                        {pct}% Funded
                      </Badge>
                    </div>
                    <div className="h-2.5 bg-white/[0.08] rounded-full overflow-hidden mb-3 shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]">
                      <div
                        className="h-full bg-gradient-to-r from-[var(--color-accent)] to-[#a3e635] rounded-full transition-all duration-500 shadow-[0_0_10px_rgba(132,204,22,0.4)]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <p className="text-xs font-bold font-mono text-[var(--color-text-secondary)]">
                        ${(g.current || 0).toLocaleString()} of ${g.target.toLocaleString()}
                      </p>
                      <div className="flex items-center gap-1.5">
                        {[100, 500, 1000].map((amt) => (
                          <button
                            key={amt}
                            onClick={() => updateSavingsGoal(g, amt)}
                            className="px-2.5 py-1 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[11px] font-bold text-[var(--color-text-primary)] hover:bg-white/[0.08] active:scale-95 transition-all"
                          >
                            +${amt}
                          </button>
                        ))}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Transaction Modal */}
      <Modal
        isOpen={showTransForm}
        onClose={() => {
          setShowTransForm(false);
          setEditingTrans(null);
        }}
        title={editingTrans ? 'Edit Transaction' : 'Record Transaction'}
      >
        <div className="space-y-4">
          <div className="flex gap-1 p-1 bg-white/[0.04] border border-white/[0.06] rounded-2xl">
            {['expense', 'income'].map((t) => (
              <button
                key={t}
                onClick={() => {
                  setTransType(t);
                  setTransCat(t === 'income' ? 'salary' : 'food');
                }}
                className={`flex-1 py-2 rounded-xl text-xs font-bold capitalize transition-all ${
                  transType === t
                    ? 'bg-white/[0.12] text-white shadow-[0_2px_8px_rgba(0,0,0,0.4),inset_0_1px_0_0_rgba(255,255,255,0.15)]'
                    : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <div>
            <label className="text-xs font-bold text-[var(--color-text-secondary)] mb-1 block">
              Amount ($)
            </label>
            <input
              type="number"
              value={transAmount}
              onChange={(e) => setTransAmount(e.target.value)}
              placeholder="0.00"
              className="font-mono font-bold text-base"
              autoFocus
            />
          </div>

          <div>
            <label className="text-xs font-bold text-[var(--color-text-secondary)] mb-1 block">
              Description
            </label>
            <input
              value={transDesc}
              onChange={(e) => setTransDesc(e.target.value)}
              placeholder="e.g., Whole Foods Groceries, Gym Membership, Client Retainer"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-[var(--color-text-secondary)] mb-1 block">
              Category
            </label>
            <select value={transCat} onChange={(e) => setTransCat(e.target.value)}>
              {(transType === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map((c) => (
                <option key={c} value={c}>
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-[var(--color-text-secondary)] mb-1 block">
              Date
            </label>
            <input
              type="date"
              value={transDate}
              onChange={(e) => setTransDate(e.target.value)}
            />
          </div>

          <Button
            onClick={saveTransaction}
            disabled={!transAmount || !transDesc.trim()}
            className="w-full"
          >
            {editingTrans ? 'Update Transaction' : 'Record Transaction'}
          </Button>
        </div>
      </Modal>

      {/* Savings Goal Modal */}
      <Modal
        isOpen={showSavingsForm}
        onClose={() => setShowSavingsForm(false)}
        title="New Savings Milestone"
      >
        <div className="space-y-4">
          <div>
            <label className="text-xs font-bold text-[var(--color-text-secondary)] mb-1 block">
              Goal Name
            </label>
            <input
              value={savingsName}
              onChange={(e) => setSavingsName(e.target.value)}
              placeholder="e.g., 6-Month Emergency Runway"
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs font-bold text-[var(--color-text-secondary)] mb-1 block">
              Target Amount ($)
            </label>
            <input
              type="number"
              value={savingsTarget}
              onChange={(e) => setSavingsTarget(e.target.value)}
              placeholder="e.g., 10000"
              className="font-mono font-bold"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-[var(--color-text-secondary)] mb-1 block">
              Initial Capital Deposited ($)
            </label>
            <input
              type="number"
              value={savingsCurrent}
              onChange={(e) => setSavingsCurrent(e.target.value)}
              placeholder="0"
              className="font-mono font-bold"
            />
          </div>
          <Button
            onClick={saveSavingsGoal}
            disabled={!savingsName.trim() || !savingsTarget}
            className="w-full"
          >
            Create Savings Milestone
          </Button>
        </div>
      </Modal>
    </div>
  );
}
