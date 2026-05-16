import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  RefreshControl,
  TextInput,
} from 'react-native';
import {
  configureDeviceState,
  submitDirectives,
  getDeviceStatus,
  type DeviceStatusResponse,
} from '../services/flagApi';
import {
  getDirectives,
  type Directive,
} from '../services/directiveApi';
import {
  getCurrentLocation,
} from '../services/locationService';

export default function FlagControlScreen() {
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatusResponse['status'] | null>(null);
  const [stateCode, setStateCode] = useState('');
  const [federalDirective, setFederalDirective] = useState<Directive | null>(null);
  const [stateDirective, setStateDirective] = useState<Directive | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [deviceConfigured, setDeviceConfigured] = useState(false);

  const loadData = useCallback(async () => {
    try {
      // Get device location to determine state
      const location = await getCurrentLocation();
      if (location.state) {
        setStateCode(location.state);
      }

      // Load device status
      const status = await getDeviceStatus();
      setDeviceStatus(status.status);

      if (status.status.deviceState) {
        setDeviceConfigured(true);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    // Poll for updates every 10 seconds
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  const handleConfigureDevice = async () => {
    if (!stateCode || stateCode.length !== 2) {
      Alert.alert('Error', 'Please enter a valid 2-letter state code (e.g., DC, CA, TX)');
      return;
    }

    setSubmitting(true);
    try {
      const response = await configureDeviceState(stateCode);

      if (response.success) {
        Alert.alert(
          'Device Configured',
          `Device state set to ${stateCode.toUpperCase()}. You can now send directives.`
        );
        setDeviceConfigured(true);
        setTimeout(loadData, 1000);
      } else {
        Alert.alert('Error', 'Failed to configure device');
      }
    } catch (error) {
      Alert.alert('Error', `Failed to configure device: ${error}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleFetchAndSendDirectives = async () => {
    if (!deviceConfigured) {
      Alert.alert('Error', 'Please configure device state first');
      return;
    }

    if (!stateCode || stateCode.length !== 2) {
      Alert.alert('Error', 'Invalid state code');
      return;
    }

    setSubmitting(true);
    try {
      // Fetch current directives
      const directives = await getDirectives(stateCode.toUpperCase());

      setFederalDirective(directives.federal);
      setStateDirective(directives.state);

      // Send directives to Arduino
      const response = await submitDirectives(
        directives.federal,
        directives.state
      );

      if (response.success) {
        const hasActive = (directives.federal?.requiresHalf) || (directives.state?.requiresHalf);

        Alert.alert(
          'Directives Sent',
          hasActive
            ? `Half-staff directives sent to device.\n\nThe Arduino will enforce half-staff position based on these directives.`
            : `No active half-staff directives found.\n\nThe Arduino will maintain full-staff position.`
        );

        // Reload status after a short delay
        setTimeout(loadData, 1000);
      } else {
        Alert.alert('Error', 'Failed to send directives');
      }
    } catch (error) {
      Alert.alert('Error', `Failed to fetch/send directives: ${error}`);
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusColor = (status: string | null) => {
    switch (status) {
      case 'ENFORCED':
        return '#22c55e';
      case 'DENIED_REQUEST':
        return '#ef4444';
      case 'IDLE':
        return '#3b82f6';
      default:
        return '#6b7280';
    }
  };

  const formatDate = (timestamp: number) => {
    if (!timestamp || timestamp === 0) return 'No expiration';
    return new Date(timestamp * 1000).toLocaleString();
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>Loading device status...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Device Configuration */}
      <View style={styles.configSection}>
        <Text style={styles.sectionTitle}>Device Configuration</Text>

        <View style={styles.configCard}>
          <Text style={styles.configLabel}>Device State Code</Text>
          <TextInput
            style={styles.input}
            value={stateCode}
            onChangeText={(text) => setStateCode(text.toUpperCase())}
            placeholder="e.g., DC, CA, TX"
            maxLength={2}
            autoCapitalize="characters"
            editable={!deviceConfigured}
          />

          {deviceStatus?.deviceState && (
            <View style={styles.currentStateBox}>
              <Text style={styles.currentStateLabel}>Current State:</Text>
              <Text style={styles.currentStateValue}>{deviceStatus.deviceState}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.configButton, deviceConfigured && styles.configButtonDisabled]}
            onPress={handleConfigureDevice}
            disabled={submitting || deviceConfigured}
          >
            <Text style={styles.configButtonText}>
              {deviceConfigured ? '✓ Device Configured' : '⚙️ Configure Device'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Device Status Display */}
      <View style={styles.statusSection}>
        <Text style={styles.sectionTitle}>Device Status</Text>

        <View style={styles.statusCard}>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Flag Position:</Text>
            <Text style={styles.statusValue}>
              {deviceStatus?.currentPosition?.toUpperCase() || 'UNKNOWN'}
            </Text>
          </View>

          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Arduino Status:</Text>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: getStatusColor(deviceStatus?.arduinoStatus || null) },
              ]}
            >
              <Text style={styles.statusBadgeText}>
                {deviceStatus?.arduinoStatus || 'UNKNOWN'}
              </Text>
            </View>
          </View>

          {deviceStatus?.explanation && (
            <View style={styles.explainBox}>
              <Text style={styles.explainLabel}>Device Explanation:</Text>
              <Text style={styles.explainText}>{deviceStatus.explanation}</Text>
            </View>
          )}

          {deviceStatus?.lastUpdateAt && (
            <View style={styles.timestampRow}>
              <Text style={styles.timestampText}>
                Last updated: {new Date(deviceStatus.lastUpdateAt).toLocaleString()}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Current Directives */}
      {(deviceStatus?.federalDirective || deviceStatus?.stateDirective) && (
        <View style={styles.directivesSection}>
          <Text style={styles.sectionTitle}>Active Directives</Text>

          {deviceStatus.federalDirective?.active && (
            <View style={styles.directiveCard}>
              <View style={styles.directiveHeader}>
                <Text style={styles.directiveAuthority}>🇺🇸 Federal</Text>
                <View style={styles.activeBadge}>
                  <Text style={styles.activeBadgeText}>ACTIVE</Text>
                </View>
              </View>
              <Text style={styles.directiveReason}>
                {deviceStatus.federalDirective.reason || 'No reason provided'}
              </Text>
              <Text style={styles.directiveExpiry}>
                Expires: {formatDate(deviceStatus.federalDirective.expiresAt || 0)}
              </Text>
            </View>
          )}

          {deviceStatus.stateDirective?.active && (
            <View style={styles.directiveCard}>
              <View style={styles.directiveHeader}>
                <Text style={styles.directiveAuthority}>🏛️ State</Text>
                <View style={styles.activeBadge}>
                  <Text style={styles.activeBadgeText}>ACTIVE</Text>
                </View>
              </View>
              <Text style={styles.directiveReason}>
                {deviceStatus.stateDirective.reason || 'No reason provided'}
              </Text>
              <Text style={styles.directiveExpiry}>
                Expires: {formatDate(deviceStatus.stateDirective.expiresAt || 0)}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Info Box */}
      <View style={styles.infoSection}>
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>ℹ️ How It Works</Text>
          <Text style={styles.infoText}>
            1. Configure your device's state location
          </Text>
          <Text style={styles.infoText}>
            2. Fetch and send current half-staff directives
          </Text>
          <Text style={styles.infoText}>
            3. The Arduino decides flag position based on federal and state requirements
          </Text>
          <Text style={styles.infoText}>
            4. Half-mast directives override all other requirements
          </Text>
        </View>
      </View>

      {/* Control Button */}
      <View style={styles.controlSection}>
        <Text style={styles.sectionTitle}>Send Directives to Device</Text>

        <TouchableOpacity
          style={[styles.submitButton, !deviceConfigured && styles.submitButtonDisabled]}
          onPress={handleFetchAndSendDirectives}
          disabled={submitting || !deviceConfigured}
        >
          <Text style={styles.submitButtonText}>
            📡 Fetch & Send Directives
          </Text>
          <Text style={styles.submitButtonSubtext}>
            Arduino will determine flag position
          </Text>
        </TouchableOpacity>

        {!deviceConfigured && (
          <Text style={styles.disabledNote}>
            Configure device state first
          </Text>
        )}
      </View>

      {submitting && (
        <View style={styles.submittingOverlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.submittingText}>Processing...</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#64748b',
  },
  configSection: {
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  configCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 16,
  },
  configLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 12,
  },
  currentStateBox: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  currentStateLabel: {
    fontSize: 14,
    color: '#64748b',
    marginRight: 8,
  },
  currentStateValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#059669',
  },
  configButton: {
    backgroundColor: '#8b5cf6',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  configButtonDisabled: {
    backgroundColor: '#059669',
  },
  configButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  statusSection: {
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 12,
  },
  statusCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 16,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusLabel: {
    fontSize: 15,
    color: '#475569',
    fontWeight: '500',
  },
  statusValue: {
    fontSize: 15,
    color: '#1e293b',
    fontWeight: '600',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  statusBadgeText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  explainBox: {
    backgroundColor: '#e0f2fe',
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
  },
  explainLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#075985',
    marginBottom: 4,
  },
  explainText: {
    fontSize: 14,
    color: '#0c4a6e',
    lineHeight: 20,
  },
  timestampRow: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  timestampText: {
    fontSize: 13,
    color: '#64748b',
    fontStyle: 'italic',
  },
  directivesSection: {
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    marginTop: 8,
  },
  directiveCard: {
    backgroundColor: '#fef3c7',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#f59e0b',
  },
  directiveHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  directiveAuthority: {
    fontSize: 16,
    fontWeight: '700',
    color: '#92400e',
  },
  activeBadge: {
    backgroundColor: '#f59e0b',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  activeBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  directiveReason: {
    fontSize: 14,
    color: '#78350f',
    marginBottom: 8,
    lineHeight: 20,
  },
  directiveExpiry: {
    fontSize: 12,
    color: '#92400e',
    fontStyle: 'italic',
  },
  infoSection: {
    padding: 16,
    marginTop: 8,
  },
  infoBox: {
    backgroundColor: '#f0f9ff',
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#3b82f6',
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e40af',
    marginBottom: 12,
  },
  infoText: {
    fontSize: 14,
    color: '#1e3a8a',
    lineHeight: 22,
    marginBottom: 6,
  },
  controlSection: {
    padding: 16,
    marginTop: 8,
    marginBottom: 32,
  },
  submitButton: {
    backgroundColor: '#3b82f6',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  submitButtonDisabled: {
    backgroundColor: '#94a3b8',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  submitButtonSubtext: {
    color: '#fff',
    fontSize: 14,
    opacity: 0.9,
  },
  disabledNote: {
    marginTop: 12,
    fontSize: 13,
    color: '#ef4444',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  submittingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  submittingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
});
