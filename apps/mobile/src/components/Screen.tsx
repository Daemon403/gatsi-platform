import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, ScrollViewProps, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme';

export function Screen({ children, scroll = true, contentContainerStyle, ...props }: React.PropsWithChildren<ScrollViewProps & { scroll?: boolean }>) {
  const content = scroll ? (
    <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, contentContainerStyle]} {...props}>{children}</ScrollView>
  ) : <View style={[styles.content, styles.flex, contentContainerStyle]}>{children}</View>;
  return <SafeAreaView style={styles.safe} edges={['top']}><KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>{content}</KeyboardAvoidingView></SafeAreaView>;
}

const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.background }, flex: { flex: 1 }, content: { paddingHorizontal: 18, paddingBottom: 32 } });
