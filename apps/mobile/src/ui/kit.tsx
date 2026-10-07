import { type ReactNode, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
  type StyleProp, type TextInputProps, type TextStyle, type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { addDays, isISODate, type ISODate } from '@busledger/core';
import { color, font, MIN_TOUCH, radius, space, type } from './theme';
import { useT } from '../lib/i18n';

export type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

type Variant = keyof typeof type;

export function Txt({ variant = 'body', bold, tone = color.ink, style, children, numberOfLines, center }: {
  variant?: Variant; bold?: boolean; tone?: string; style?: StyleProp<TextStyle>; children: ReactNode; numberOfLines?: number; center?: boolean;
}) {
  const size = type[variant];
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[{ fontFamily: bold || variant === 'figure' || variant === 'title' ? font.bold : font.regular, fontSize: size, lineHeight: Math.round(size * 1.3), color: tone, textAlign: center ? 'center' : 'left' }, style]}
    >
      {children}
    </Text>
  );
}

/** Scrolling page with an optional footer pinned above the system bar, where the thumb rests. */
export function Screen({ children, footer, scroll = true }: { children: ReactNode; footer?: ReactNode; scroll?: boolean }) {
  const insets = useSafeAreaInsets();
  const body = <View style={{ padding: space.lg, gap: space.lg }}>{children}</View>;
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: color.ground }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {scroll ? <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: space.xl }}>{body}</ScrollView> : <View style={{ flex: 1 }}>{body}</View>}
      {footer ? <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, space.md) }]}>{footer}</View> : null}
    </KeyboardAvoidingView>
  );
}

export function Sheet({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.sheet, style]}>{children}</View>;
}

export function Btn({ label, onPress, kind = 'secondary', icon, disabled, busy }: {
  label: string; onPress: () => void; kind?: 'primary' | 'secondary' | 'quiet' | 'danger'; icon?: IconName; disabled?: boolean; busy?: boolean;
}) {
  const fg = kind === 'primary' ? color.ink : kind === 'danger' ? color.owing : color.blue;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled || !!busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        s.btn,
        kind === 'primary' && { backgroundColor: pressed ? color.yellowPressed : color.yellow, minHeight: 60 },
        kind === 'secondary' && { borderWidth: 2, borderColor: color.blue, backgroundColor: pressed ? color.blueTint : color.sheet },
        kind === 'danger' && { borderWidth: 2, borderColor: color.owing, backgroundColor: pressed ? color.owingTint : color.sheet },
        kind === 'quiet' && { backgroundColor: pressed ? color.blueTint : 'transparent' },
        (disabled || busy) && { opacity: 0.45 },
      ]}
    >
      {busy ? <ActivityIndicator color={fg} /> : icon ? <MaterialCommunityIcons name={icon} size={24} color={fg} /> : null}
      <Txt variant={kind === 'primary' ? 'heading' : 'body'} bold tone={fg}>{label}</Txt>
    </Pressable>
  );
}

export function Field({ label, error, hint, optional, ...input }: TextInputProps & { label: string; error?: string | null; hint?: string; optional?: boolean }) {
  const { t } = useT();
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ gap: space.xs }}>
      <Txt variant="label" bold>{label}{optional ? <Txt variant="label" tone={color.inkSoft}>{` (${t('optional')})`}</Txt> : null}</Txt>
      <TextInput
        {...input}
        accessibilityLabel={label}
        onFocus={(e) => { setFocus(true); input.onFocus?.(e); }}
        onBlur={(e) => { setFocus(false); input.onBlur?.(e); }}
        placeholderTextColor={color.muted}
        style={[s.input, focus && { borderColor: color.blue }, !!error && { borderColor: color.owing }, input.multiline && { minHeight: 96, textAlignVertical: 'top' }]}
      />
      {error ? (
        <View style={s.inline}><MaterialCommunityIcons name="alert-circle" size={18} color={color.owing} /><Txt variant="small" tone={color.owing} style={{ flex: 1 }}>{error}</Txt></View>
      ) : hint ? <Txt variant="small" tone={color.inkSoft}>{hint}</Txt> : null}
    </View>
  );
}

export function Chip({ label, selected, onPress, icon }: { label: string; selected?: boolean; onPress: () => void; icon?: IconName }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={[s.chip, selected ? { backgroundColor: color.blue, borderColor: color.blue } : null]}
    >
      {selected ? <MaterialCommunityIcons name="check" size={18} color={color.sheet} /> : icon ? <MaterialCommunityIcons name={icon} size={18} color={color.ink} /> : null}
      <Txt variant="label" bold tone={selected ? color.sheet : color.ink}>{label}</Txt>
    </Pressable>
  );
}

export function ChipRow({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>{children}</View>;
}

export type Tag = 'paid' | 'partial' | 'unpaid' | 'cancelled' | 'current' | 'in_arrears' | 'in_advance' | 'inactive';

const TAGS: Record<Tag, { icon: IconName; fg: string; bg: string; key: Parameters<ReturnType<typeof useT>['t']>[0] }> = {
  paid: { icon: 'check-circle', fg: color.paid, bg: color.paidTint, key: 'stPaid' },
  partial: { icon: 'circle-half-full', fg: color.partial, bg: color.partialTint, key: 'stPartial' },
  unpaid: { icon: 'alert-circle', fg: color.owing, bg: color.owingTint, key: 'stUnpaid' },
  cancelled: { icon: 'minus-circle-outline', fg: color.muted, bg: color.mutedTint, key: 'stCancelled' },
  current: { icon: 'check-circle', fg: color.paid, bg: color.paidTint, key: 'accCurrent' },
  in_arrears: { icon: 'alert-circle', fg: color.owing, bg: color.owingTint, key: 'accArrears' },
  in_advance: { icon: 'arrow-up-bold-circle', fg: color.paid, bg: color.paidTint, key: 'accAdvance' },
  inactive: { icon: 'account-off-outline', fg: color.muted, bg: color.mutedTint, key: 'inactive' },
};

/** Status is always icon + word, never colour alone (NFR-008). */
export function StatusTag({ tag, label }: { tag: Tag; label?: string }) {
  const { t } = useT();
  const d = TAGS[tag];
  return (
    <View style={[s.tag, { backgroundColor: d.bg }]}>
      <MaterialCommunityIcons name={d.icon} size={18} color={d.fg} />
      <Txt variant="small" bold tone={d.fg}>{label ?? t(d.key)}</Txt>
    </View>
  );
}

export function ListRow({ title, subtitle, right, onPress, leading }: { title: string; subtitle?: ReactNode; right?: ReactNode; onPress?: () => void; leading?: ReactNode }) {
  return (
    <Pressable accessibilityRole={onPress ? 'button' : undefined} onPress={onPress} disabled={!onPress} style={({ pressed }) => [s.row, pressed && { backgroundColor: color.blueTint }]}>
      {leading}
      <View style={{ flex: 1, gap: 2 }}>
        <Txt bold numberOfLines={1}>{title}</Txt>
        {typeof subtitle === 'string' ? <Txt variant="small" tone={color.inkSoft} numberOfLines={2}>{subtitle}</Txt> : subtitle}
      </View>
      {right}
      {onPress ? <MaterialCommunityIcons name="chevron-right" size={24} color={color.muted} /> : null}
    </Pressable>
  );
}

export function Divider() {
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: color.rule, marginLeft: space.lg }} />;
}

export function Banner({ tone, text, icon, action }: { tone: 'info' | 'warn' | 'danger'; text: string; icon?: IconName; action?: { label: string; onPress: () => void } }) {
  const c = tone === 'danger' ? { fg: color.owing, bg: color.owingTint } : tone === 'warn' ? { fg: color.partial, bg: color.partialTint } : { fg: color.blue, bg: color.blueTint };
  return (
    <View style={[s.banner, { backgroundColor: c.bg, borderLeftColor: c.fg }]}>
      <View style={s.inline}>
        <MaterialCommunityIcons name={icon ?? (tone === 'info' ? 'information' : 'alert')} size={22} color={c.fg} />
        <Txt variant="label" style={{ flex: 1 }}>{text}</Txt>
      </View>
      {action ? <Pressable accessibilityRole="button" onPress={action.onPress} style={s.bannerAction}><Txt variant="label" bold tone={c.fg}>{action.label}</Txt></Pressable> : null}
    </View>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <View style={[s.inline, { justifyContent: 'space-between', marginTop: space.sm }]}>
      <Txt variant="heading" bold>{children}</Txt>
      {right}
    </View>
  );
}

/** A money figure with its label; the figure is the thing read at a glance. */
export function Figure({ label, value, tone = color.ink, note }: { label: string; value: string; tone?: string; note?: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Txt variant="label" tone={color.inkSoft}>{label}</Txt>
      <Txt variant="title" tone={tone}>{value}</Txt>
      {note ? <Txt variant="small" tone={color.inkSoft}>{note}</Txt> : null}
    </View>
  );
}

export function DateChooser({ value, onChange, today, label }: { value: ISODate; onChange: (d: ISODate) => void; today: ISODate; label: string }) {
  const { t } = useT();
  const yesterday = addDays(today, -1);
  const [other, setOther] = useState(value !== today && value !== yesterday);
  const [text, setText] = useState(value);
  const bad = other && (!isISODate(text) || text > today);
  return (
    <View style={{ gap: space.sm }}>
      <Txt variant="label" bold>{label}</Txt>
      <ChipRow>
        <Chip label={t('today')} selected={!other && value === today} onPress={() => { setOther(false); onChange(today); }} />
        <Chip label={t('yesterday')} selected={!other && value === yesterday} onPress={() => { setOther(false); onChange(yesterday); }} />
        <Chip label={t('otherDate')} selected={other} onPress={() => setOther(true)} />
      </ChipRow>
      {other ? (
        <Field
          label={t('otherDate')} value={text} keyboardType="numbers-and-punctuation" placeholder="2026-10-06"
          hint={t('dateFormatHint')} error={bad && text.length >= 10 ? t('dateFormatHint') : null}
          onChangeText={(v) => { setText(v); if (isISODate(v) && v <= today) onChange(v); }}
        />
      ) : null}
    </View>
  );
}

export function Icon({ name, size = 24, tone = color.ink }: { name: IconName; size?: number; tone?: string }) {
  return <MaterialCommunityIcons name={name} size={size} color={tone} />;
}

const s = StyleSheet.create({
  footer: { paddingHorizontal: space.lg, paddingTop: space.md, backgroundColor: color.sheet, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.rule, gap: space.sm },
  sheet: { backgroundColor: color.sheet, borderRadius: radius.sheet, padding: space.lg, gap: space.md },
  btn: { minHeight: MIN_TOUCH, borderRadius: radius.control, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, paddingHorizontal: space.lg },
  input: { minHeight: MIN_TOUCH, borderWidth: 2, borderColor: color.rule, borderRadius: radius.control, paddingHorizontal: space.md, fontSize: type.body, fontFamily: font.regular, color: color.ink, backgroundColor: color.sheet },
  inline: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  chip: { minHeight: 48, paddingHorizontal: space.lg, borderRadius: radius.pill, borderWidth: 2, borderColor: color.rule, backgroundColor: color.sheet, flexDirection: 'row', alignItems: 'center', gap: space.xs },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: space.sm, paddingVertical: 4, borderRadius: radius.pill, alignSelf: 'flex-start' },
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
  banner: { borderRadius: radius.control, borderLeftWidth: 5, padding: space.md, gap: space.sm },
  bannerAction: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
});
