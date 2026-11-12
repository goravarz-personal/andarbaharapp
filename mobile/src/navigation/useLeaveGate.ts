import { useEffect } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from './types';

/**
 * Walks out of a forced screen once the thing it was asking for is done.
 *
 * Both gate screens - set your password, add your number - are registered in
 * the main stack too, so they can be opened later by choice. That means
 * clearing a gate does not move anybody by itself: the route they are on still
 * exists, and on the web the address bar still names it, so React Navigation
 * restores it right back. Somebody who had just set their password was left
 * looking at the form they had already filled in.
 *
 * An effect rather than a line after the save, because the main stack has to
 * exist before anything can be sent to it.
 */
export function useLeaveGate(forced: boolean, stillNeeded: boolean): void {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  useEffect(() => {
    if (!forced || stillNeeded) return;
    navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] });
  }, [forced, stillNeeded, navigation]);
}
