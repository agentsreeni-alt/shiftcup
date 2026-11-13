import { Stack } from 'expo-router';

export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="home" />
      <Stack.Screen name="setup" />
      <Stack.Screen name="(manager)" />
      <Stack.Screen name="(employee)" />
      <Stack.Screen name="billing" />
      <Stack.Screen name="admin" />
    </Stack>
  );
}
