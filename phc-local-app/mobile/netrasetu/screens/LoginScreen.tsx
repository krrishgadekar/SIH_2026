/** Desktop LoginScreen.jsx: retina backdrop, eye mark, RETINAL✦DIAGNOSTICS, technician auth card. */
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { makeStyles } from '../theme/ThemeContext';
import { RetinalBackdrop, EyeMark } from '../components/RetinalBackdrop';
import { Btn, Field, Input } from '../components/ui';
import { DEMO_HINT, useAuth } from '../auth/AuthContext';
import { getConfig } from '../config';
import { useNavigation } from '@react-navigation/native';

export default function LoginScreen() {
  const s = useStyles();
  const { t } = useTranslation();
  const { login } = useAuth();
  const navigation = useNavigation<any>();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!username.trim() || !password) {
      setError(t('login.auth.errorEmpty', 'Please enter both username and password.'));
      return;
    }
    setLoading(true);
    setError(null);
    const r = await login(username, password);
    setLoading(false);
    if (!r.ok) setError(r.message);
  };

  const [title1, title2] = t('login.title', 'RETINAL✦DIAGNOSTICS').split('✦');

  return (
    <View style={s.root}>
      <RetinalBackdrop />
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
            <View style={s.hero}>
              <EyeMark size={96} />
              <Text style={s.title} accessibilityRole="header">
                {title1}<Text style={s.star}>✦</Text>{title2 ?? ''}
              </Text>
              <Text style={s.subtitle}>{t('login.subtitle', 'PRIMARY HEALTH CENTRE MODULE · LOCAL QUALITY GATE')}</Text>
              <Text style={s.version}>NETRA SETU PLATFORM · MOBILE · {getConfig().phcName.toUpperCase()}</Text>
            </View>

            <View style={s.card}>
              <View style={s.topbar}>
                <Text style={s.topbarText}>{t('login.auth.authenticatingAs', { role: 'PHC TECHNICIAN', defaultValue: 'AUTHENTICATING AS: PHC TECHNICIAN' })}</Text>
              </View>
              <View style={s.box}>
                {error ? (
                  <View style={s.error}><Text style={s.errorText}>⚠ {error}</Text></View>
                ) : null}
                <Field label={t('login.auth.username', 'USERNAME')}>
                  <Input value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} autoComplete="username" returnKeyType="next" />
                </Field>
                <Field label={t('login.auth.password', 'PASSWORD')}>
                  <Input value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" returnKeyType="go" onSubmitEditing={submit} />
                </Field>
                <Btn
                  size="lg"
                  loading={loading}
                  label={loading ? t('login.auth.authenticating', 'AUTHENTICATING...') : t('login.auth.initiate', 'INITIATE SESSION ✦')}
                  onPress={submit}
                />
                <Btn variant="ghost" size="sm" label="PAIR WITH PHC PC" onPress={() => navigation.navigate('Pairing')} style={{ marginTop: 10 }} />
                {DEMO_HINT ? (
                  <Text style={s.hint}>
                    {t('login.auth.demo', 'DEMO CREDENTIALS:')} <Text style={s.hintStrong}>{DEMO_HINT}</Text>
                  </Text>
                ) : null}
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  root: { flex: 1, backgroundColor: t.c.surface },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  hero: { alignItems: 'center', marginBottom: 24 },
  title: { fontFamily: t.fonts.heavy, fontSize: 27, color: t.c.text, textAlign: 'center', marginTop: 12, letterSpacing: -0.5 },
  star: { color: t.c.crimson },
  subtitle: { fontFamily: t.fonts.mono, fontSize: 11, color: t.c.text, opacity: 0.85, textAlign: 'center', marginTop: 8 },
  version: { fontFamily: t.fonts.monoBold, fontSize: 9.5, letterSpacing: 1, color: t.c.textMuted, textAlign: 'center', marginTop: 4 },
  card: {
    borderWidth: 1.5,
    borderColor: t.c.black,
    backgroundColor: t.c.creamLight,
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 6,
  },
  topbar: { backgroundColor: t.c.crimson, paddingHorizontal: 14, paddingVertical: 8 },
  topbarText: { fontFamily: t.fonts.monoBold, fontSize: 11, letterSpacing: 1, color: '#FFFFFF' },
  box: { padding: 16 },
  error: { borderWidth: 1, borderColor: t.c.crimson, backgroundColor: t.c.dangerBg, padding: 10, marginBottom: 12 },
  errorText: { fontFamily: t.fonts.monoBold, fontSize: 11, color: t.c.danger },
  hint: { fontFamily: t.fonts.mono, fontSize: 10.5, color: t.c.textMuted, textAlign: 'center', marginTop: 14 },
  hintStrong: { fontFamily: t.fonts.monoBold, color: t.c.crimson },
}));
