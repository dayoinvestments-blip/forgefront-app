import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useDispatch, useSelector } from 'react-redux';
import { Ionicons } from '@expo/vector-icons';
import { format, addDays } from 'date-fns';
import { Colors, Spacing, Radius, Typography } from '@/theme';
import { RootState, addInvoice, updateInvoice, Invoice, InvoiceLineItem } from '@/store';
import { InvoiceService } from '@/services/InvoiceService';
import { formatCurrency } from '@/utils/format';

type InvoiceRouteParams = {
  Invoice: { jobId?: string; invoiceId?: string };
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function uuid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function emptyLine(): InvoiceLineItem {
  return { id: uuid(), description: '', quantity: 1, unitPrice: 0 };
}

// ─── Sub-components ──────────────────────────────────────────────────────────
function SectionHeader({ title }: { title: string }) {
  return (
    <Text style={styles.sectionHeader}>{title.toUpperCase()}</Text>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function LineItemRow({
  item,
  onUpdate,
  onDelete,
}: {
  item: InvoiceLineItem;
  onUpdate: (id: string, field: keyof InvoiceLineItem, value: string) => void;
  onDelete: (id: string) => void;
}) {
  const lineTotal = item.quantity * item.unitPrice;
  return (
    <View style={styles.lineItem}>
      <View style={styles.lineItemTop}>
        <TextInput
          style={[styles.input, { flex: 1, marginRight: Spacing.sm }]}
          value={item.description}
          onChangeText={v => onUpdate(item.id, 'description', v)}
          placeholder="Description of work..."
          placeholderTextColor={Colors.textMuted}
        />
        <TouchableOpacity onPress={() => onDelete(item.id)} style={styles.deleteBtn}>
          <Ionicons name="trash-outline" size={16} color={Colors.danger} />
        </TouchableOpacity>
      </View>
      <View style={styles.lineItemBottom}>
        <View style={styles.qtyBlock}>
          <Text style={styles.miniLabel}>QTY</Text>
          <TextInput
            style={[styles.input, styles.numInput]}
            value={String(item.quantity)}
            onChangeText={v => onUpdate(item.id, 'quantity', v)}
            keyboardType="decimal-pad"
          />
        </View>
        <View style={styles.qtyBlock}>
          <Text style={styles.miniLabel}>UNIT PRICE</Text>
          <TextInput
            style={[styles.input, styles.numInput]}
            value={item.unitPrice > 0 ? String(item.unitPrice) : ''}
            onChangeText={v => onUpdate(item.id, 'unitPrice', v)}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={Colors.textMuted}
          />
        </View>
        <View style={[styles.qtyBlock, { alignItems: 'flex-end' }]}>
          <Text style={styles.miniLabel}>TOTAL</Text>
          <Text style={styles.lineTotal}>{formatCurrency(lineTotal)}</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────
export function InvoiceScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<InvoiceRouteParams, 'Invoice'>>();
  const dispatch = useDispatch();

  const { jobId, invoiceId } = route.params ?? {};

  const job = useSelector((s: RootState) => s.jobs.items.find(j => j.id === jobId));
  const existingInvoice = useSelector((s: RootState) =>
    s.invoices.items.find(i => i.id === invoiceId)
  );
  const user = useSelector((s: RootState) => s.auth.user);

  // ─── State ────────────────────────────────────────────────────────────────
  const [client, setClient] = useState(existingInvoice?.client ?? job?.client ?? '');
  const [clientEmail, setClientEmail] = useState(existingInvoice?.clientEmail ?? '');
  const [clientAddress, setClientAddress] = useState(existingInvoice?.clientAddress ?? '');
  const [taxRate, setTaxRate] = useState(String(existingInvoice?.taxRate ?? 0));
  const [notes, setNotes] = useState(existingInvoice?.notes ?? 'Payment due within 30 days. Thank you for your business.');
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>(
    existingInvoice?.lineItems ?? [emptyLine()]
  );
  const [isSending, setIsSending] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);

  // ─── Derived ─────────────────────────────────────────────────────────────
  const parsedTax = parseFloat(taxRate) || 0;
  const { subtotal, taxAmount, total } = InvoiceService.calcTotals(lineItems, parsedTax);

  const buildInvoice = useCallback((): Invoice => {
    const id = existingInvoice?.id ?? uuid();
    const now = new Date();
    return {
      id,
      invoiceNumber: existingInvoice?.invoiceNumber ?? InvoiceService.generateInvoiceNumber(),
      jobId: jobId ?? '',
      jobName: job?.name ?? 'General Work',
      client,
      clientEmail,
      clientAddress,
      issueDate: existingInvoice?.issueDate ?? now.toISOString(),
      dueDate: existingInvoice?.dueDate ?? addDays(now, 30).toISOString(),
      lineItems,
      subtotal,
      taxRate: parsedTax,
      taxAmount,
      total,
      status: existingInvoice?.status ?? 'draft',
      notes,
    };
  }, [existingInvoice, jobId, job, client, clientEmail, clientAddress, lineItems, subtotal, parsedTax, taxAmount, total, notes]);

  // ─── Line Item Handlers ──────────────────────────────────────────────────
  function handleUpdateLine(id: string, field: keyof InvoiceLineItem, raw: string) {
    setLineItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      if (field === 'description') return { ...item, description: raw };
      if (field === 'quantity') return { ...item, quantity: parseFloat(raw) || 0 };
      if (field === 'unitPrice') return { ...item, unitPrice: parseFloat(raw) || 0 };
      return item;
    }));
  }

  function handleDeleteLine(id: string) {
    if (lineItems.length === 1) return; // always keep at least one
    setLineItems(prev => prev.filter(item => item.id !== id));
  }

  function handleAddLine() {
    setLineItems(prev => [...prev, emptyLine()]);
  }

  // ─── Save ────────────────────────────────────────────────────────────────
  function handleSave(newStatus?: Invoice['status']) {
    const invoice = { ...buildInvoice(), ...(newStatus ? { status: newStatus } : {}) };
    if (existingInvoice) {
      dispatch(updateInvoice(invoice));
    } else {
      dispatch(addInvoice(invoice));
    }
    return invoice;
  }

  // ─── Share ───────────────────────────────────────────────────────────────
  async function handleShare() {
    if (!client.trim()) {
      Alert.alert('Missing Info', 'Please enter a client name before sharing.');
      return;
    }
    setIsSending(true);
    try {
      const invoice = handleSave('sent');
      await InvoiceService.generateAndShare(invoice, user?.company ?? 'My Company');
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Could not generate PDF.');
    } finally {
      setIsSending(false);
    }
  }

  async function handlePrint() {
    setIsPrinting(true);
    try {
      const invoice = handleSave();
      await InvoiceService.printInvoice(invoice, user?.company ?? 'My Company');
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Could not print.');
    } finally {
      setIsPrinting(false);
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Nav Header */}
        <View style={styles.navBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={22} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.navTitle}>
            {existingInvoice ? `Invoice #${existingInvoice.invoiceNumber}` : 'New Invoice'}
          </Text>
          <TouchableOpacity onPress={() => { handleSave(); navigation.goBack(); }} style={styles.saveBtn}>
            <Text style={styles.saveBtnText}>Save</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Job Context Banner */}
          {job && (
            <View style={styles.jobBanner}>
              <Ionicons name="briefcase-outline" size={14} color={Colors.accent} />
              <Text style={styles.jobBannerText}>{job.name}</Text>
              <View style={styles.jobValueBadge}>
                <Text style={styles.jobValueText}>{formatCurrency(job.value)}</Text>
              </View>
            </View>
          )}

          {/* Client Info */}
          <SectionHeader title="Client Info" />
          <View style={styles.card}>
            <FieldRow label="Client Name *">
              <TextInput
                style={styles.input}
                value={client}
                onChangeText={setClient}
                placeholder="Company or person"
                placeholderTextColor={Colors.textMuted}
              />
            </FieldRow>
            <View style={styles.fieldDivider} />
            <FieldRow label="Email">
              <TextInput
                style={styles.input}
                value={clientEmail}
                onChangeText={setClientEmail}
                placeholder="client@email.com"
                placeholderTextColor={Colors.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </FieldRow>
            <View style={styles.fieldDivider} />
            <FieldRow label="Address">
              <TextInput
                style={styles.input}
                value={clientAddress}
                onChangeText={setClientAddress}
                placeholder="City, State"
                placeholderTextColor={Colors.textMuted}
              />
            </FieldRow>
          </View>

          {/* Line Items */}
          <SectionHeader title="Line Items" />
          {lineItems.map(item => (
            <LineItemRow
              key={item.id}
              item={item}
              onUpdate={handleUpdateLine}
              onDelete={handleDeleteLine}
            />
          ))}
          <TouchableOpacity style={styles.addLineBtn} onPress={handleAddLine}>
            <Ionicons name="add-circle-outline" size={18} color={Colors.accent} />
            <Text style={styles.addLineBtnText}>Add Line Item</Text>
          </TouchableOpacity>

          {/* Totals */}
          <View style={styles.totalsCard}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Subtotal</Text>
              <Text style={styles.totalValue}>{formatCurrency(subtotal)}</Text>
            </View>
            <View style={styles.totalRow}>
              <View style={styles.taxRow}>
                <Text style={styles.totalLabel}>Tax Rate (%)</Text>
                <TextInput
                  style={styles.taxInput}
                  value={taxRate}
                  onChangeText={setTaxRate}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={Colors.textMuted}
                />
              </View>
              <Text style={styles.totalValue}>{formatCurrency(taxAmount)}</Text>
            </View>
            <View style={styles.grandRow}>
              <Text style={styles.grandLabel}>Total Due</Text>
              <Text style={styles.grandValue}>{formatCurrency(total)}</Text>
            </View>
          </View>

          {/* Notes */}
          <SectionHeader title="Notes" />
          <TextInput
            style={styles.notesInput}
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={3}
            placeholder="Payment terms, thank you message..."
            placeholderTextColor={Colors.textMuted}
          />

          {/* Action Buttons */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.printBtn]}
              onPress={handlePrint}
              disabled={isPrinting}
            >
              {isPrinting ? (
                <ActivityIndicator size="small" color={Colors.text} />
              ) : (
                <>
                  <Ionicons name="print-outline" size={18} color={Colors.text} />
                  <Text style={styles.printBtnText}>Print</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, styles.shareBtn]}
              onPress={handleShare}
              disabled={isSending}
            >
              {isSending ? (
                <ActivityIndicator size="small" color={Colors.bg} />
              ) : (
                <>
                  <Ionicons name="share-outline" size={18} color={Colors.bg} />
                  <Text style={styles.shareBtnText}>Share PDF</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  navBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { padding: 4 },
  navTitle: { ...Typography.h4 },
  saveBtn: {
    backgroundColor: Colors.accentDim,
    borderRadius: Radius.sm,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: Colors.accentBorder,
  },
  saveBtnText: { color: Colors.accent, fontSize: 13, fontWeight: '600' },
  scroll: { flex: 1 },
  scrollContent: { padding: Spacing.lg, paddingBottom: 40 },

  jobBanner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.accentDim,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    borderWidth: 1, borderColor: Colors.accentBorder,
  },
  jobBannerText: { flex: 1, fontSize: 13, fontWeight: '500', color: Colors.accent },
  jobValueBadge: { backgroundColor: Colors.surface3, borderRadius: Radius.sm, paddingVertical: 2, paddingHorizontal: 8 },
  jobValueText: { fontSize: 12, fontWeight: '600', color: Colors.text },

  sectionHeader: {
    fontSize: 10, fontWeight: '700', letterSpacing: 1.2,
    color: Colors.textMuted, marginTop: Spacing.lg, marginBottom: Spacing.sm,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border,
    overflow: 'hidden',
  },
  fieldRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm,
  },
  fieldLabel: { width: 100, fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
  input: {
    flex: 1, fontSize: 14, color: Colors.text,
    paddingVertical: Spacing.sm,
  },
  fieldDivider: { height: 1, backgroundColor: Colors.border, marginHorizontal: Spacing.lg },

  // Line Items
  lineItem: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  lineItemTop: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm },
  deleteBtn: { padding: Spacing.sm },
  lineItemBottom: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start' },
  qtyBlock: { flex: 1 },
  miniLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 0.8, color: Colors.textMuted, marginBottom: 4 },
  numInput: { backgroundColor: Colors.surface2, borderRadius: Radius.sm, paddingHorizontal: Spacing.sm, paddingVertical: 6, textAlign: 'center' },
  lineTotal: { fontSize: 14, fontWeight: '600', color: Colors.accent, marginTop: 2 },

  addLineBtn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingVertical: Spacing.md,
    justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.accentBorder, borderStyle: 'dashed',
    borderRadius: Radius.lg, marginBottom: Spacing.lg,
  },
  addLineBtnText: { color: Colors.accent, fontSize: 13, fontWeight: '600' },

  // Totals
  totalsCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  totalLabel: { fontSize: 13, color: Colors.textSecondary },
  totalValue: { fontSize: 13, color: Colors.text, fontWeight: '500' },
  taxRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  taxInput: {
    width: 50, fontSize: 13, color: Colors.text,
    backgroundColor: Colors.surface2, borderRadius: Radius.sm,
    paddingVertical: 4, paddingHorizontal: 8, textAlign: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  grandRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: Spacing.md, marginTop: Spacing.sm,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  grandLabel: { fontSize: 16, fontWeight: '700', color: Colors.text },
  grandValue: { fontSize: 20, fontWeight: '700', color: Colors.accent },

  notesInput: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.lg, fontSize: 13, color: Colors.text,
    minHeight: 80, textAlignVertical: 'top',
    marginBottom: Spacing.xl,
  },

  // Action Buttons
  actions: { flexDirection: 'row', gap: Spacing.md },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, paddingVertical: Spacing.md, borderRadius: Radius.lg,
  },
  printBtn: { backgroundColor: Colors.surface2, borderWidth: 1, borderColor: Colors.border },
  printBtnText: { color: Colors.text, fontSize: 14, fontWeight: '600' },
  shareBtn: { backgroundColor: Colors.accent },
  shareBtnText: { color: Colors.bg, fontSize: 14, fontWeight: '700' },
});
