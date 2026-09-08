import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Colors, Typography, Spacing, Shadows } from '../theme';

export type VisualizationLayer =
  | 'original'
  | 'enhanced'
  | 'gradcam'
  | 'vessels'
  | 'lesions'
  | 'composite';

export interface LesionMarker {
  id: string;
  type: string;
  typeCode: string;
  confidence: number;
  location: string;
  xPercent: number; // 0–100% position on retina
  yPercent: number; // 0–100% position on retina
  color: string;
  explanation: string;
}

const DEFAULT_LESIONS: LesionMarker[] = [
  {
    id: 'lesion-1',
    type: 'Microaneurysm',
    typeCode: 'MA',
    confidence: 0.94,
    location: 'Superior-Temporal Arc',
    xPercent: 36,
    yPercent: 32,
    color: Colors.primaryLight,
    explanation: 'Focal dilation of retinal capillaries; hallmark sign of early microvascular impairment in NPDR.',
  },
  {
    id: 'lesion-2',
    type: 'Dot Hemorrhage',
    typeCode: 'HEM',
    confidence: 0.88,
    location: 'Inferior-Nasal Region',
    xPercent: 64,
    yPercent: 62,
    color: Colors.danger,
    explanation: 'Rupture of capillary aneurysms in the deeper retinal nuclear layers, indicative of vascular fragility.',
  },
  {
    id: 'lesion-3',
    type: 'Hard Exudate',
    typeCode: 'HEX',
    confidence: 0.91,
    location: 'Macular Periphery',
    xPercent: 50,
    yPercent: 44,
    color: Colors.accentGold,
    explanation: 'Lipoprotein deposits leaking from hyperpermeable capillaries; critical to monitor for diabetic macular edema.',
  },
  {
    id: 'lesion-4',
    type: 'Cotton Wool Spot',
    typeCode: 'CWS',
    confidence: 0.82,
    location: 'Superior Arcade',
    xPercent: 28,
    yPercent: 54,
    color: '#E0A96D',
    explanation: 'Local micro-infarction of retinal nerve fiber layers due to precapillary arteriolar occlusion.',
  },
];

interface GradCamCardProps {
  originalUri: string | null | undefined;
  processedUri?: string | null | undefined;
  gradCamUri?: string | null | undefined;
  evidenceSummary: string;
  lesions?: LesionMarker[];
}

export default function GradCamCard({
  originalUri,
  processedUri,
  gradCamUri,
  evidenceSummary,
  lesions = DEFAULT_LESIONS,
}: GradCamCardProps) {
  const [activeLayer, setActiveLayer] = useState<VisualizationLayer>('composite');
  const [selectedLesion, setSelectedLesion] = useState<LesionMarker | null>(null);

  const layers: { key: VisualizationLayer; label: string }[] = [
    { key: 'original', label: 'ORIGINAL' },
    { key: 'enhanced', label: 'ENHANCED' },
    { key: 'gradcam', label: 'GRAD-CAM' },
    { key: 'vessels', label: 'VESSELS' },
    { key: 'lesions', label: 'LESIONS' },
    { key: 'composite', label: 'COMPOSITE' },
  ];

  const showVessels = activeLayer === 'vessels' || activeLayer === 'composite';
  const showHeatmap = activeLayer === 'gradcam' || activeLayer === 'composite';
  const showLesions = activeLayer === 'lesions' || activeLayer === 'composite';
  const isEnhancedMode = activeLayer === 'enhanced' || activeLayer === 'composite';

  return (
    <View style={[styles.card, Shadows.sm]}>
      {/* Card header */}
      <View style={styles.header}>
        <View style={styles.headerAccent} />
        <Text style={styles.headerText}>INTERACTIVE RETINAL EVIDENCE</Text>
      </View>

      {/* Layer selector bar */}
      <View style={styles.layerBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.layerTabsContainer}
        >
          {layers.map((layer) => {
            const isActive = activeLayer === layer.key;
            return (
              <TouchableOpacity
                key={layer.key}
                style={[styles.layerTab, isActive && styles.layerTabActive]}
                onPress={() => {
                  setActiveLayer(layer.key);
                  if (layer.key === 'original') setSelectedLesion(null);
                }}
                activeOpacity={0.75}
              >
                <Text
                  style={[
                    styles.layerTabText,
                    isActive && styles.layerTabTextActive,
                  ]}
                >
                  {layer.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Retinal Interactive Canvas View */}
      <View style={styles.viewerContainer}>
        {originalUri ? (
          <View style={styles.retinaStage}>
            {/* 1. Base Retinal Image */}
            <Image
              source={{ uri: isEnhancedMode && processedUri ? processedUri : originalUri }}
              style={styles.retinaImage}
              resizeMode="cover"
            />

            {/* 2. Enhanced Filter Overlay */}
            {isEnhancedMode && !processedUri && (
              <View style={styles.enhancedFilterOverlay} />
            )}

            {/* 3. Grad-CAM Heatmap Layer */}
            {showHeatmap && (
              gradCamUri ? (
                <Image
                  source={{ uri: gradCamUri }}
                  style={styles.heatmapImageOverlay}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.syntheticHeatmapOverlay}>
                  <View style={styles.heatmapHotspot1} />
                  <View style={styles.heatmapHotspot2} />
                  <View style={styles.heatmapHotspot3} />
                </View>
              )
            )}

            {/* 4. Retinal Vessels Layer */}
            {showVessels && (
              <View style={styles.vesselOverlay} pointerEvents="none">
                <View style={styles.opticDiscCenter} />
                <View style={styles.vesselArchSuperior} />
                <View style={styles.vesselArchInferior} />
                <View style={styles.vesselBranchTemporal} />
                <View style={styles.vesselBranchNasal} />
              </View>
            )}

            {/* 5. Lesion Markers (Clickable over suspicious regions) */}
            {showLesions && (
              <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
                {lesions.map((marker) => {
                  const isSelected = selectedLesion?.id === marker.id;
                  return (
                    <TouchableOpacity
                      key={marker.id}
                      style={[
                        styles.lesionMarker,
                        {
                          left: `${marker.xPercent}%`,
                          top: `${marker.yPercent}%`,
                          borderColor: marker.color,
                        },
                        isSelected && styles.lesionMarkerSelected,
                      ]}
                      onPress={() => setSelectedLesion(isSelected ? null : marker)}
                      activeOpacity={0.7}
                      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    >
                      <View
                        style={[
                          styles.lesionDot,
                          { backgroundColor: marker.color },
                          isSelected && styles.lesionDotSelected,
                        ]}
                      />
                      <Text style={[styles.lesionBadgeText, { color: marker.color }]}>
                        {marker.typeCode}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* Active Layer Watermark Badge */}
            <View style={styles.layerWatermark}>
              <Text style={styles.layerWatermarkText}>
                LAYER: {activeLayer.toUpperCase()}
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.placeholderStage}>
            <Text style={styles.placeholderText}>NO IMAGE LOADED</Text>
          </View>
        )}
      </View>

      {/* Lesion Evidence Panel (shows on tap of any marker) */}
      {selectedLesion && (
        <View style={styles.evidencePanel}>
          <View style={styles.evidencePanelHeader}>
            <View style={styles.evidenceTypeRow}>
              <View
                style={[
                  styles.evidenceColorPill,
                  { backgroundColor: selectedLesion.color },
                ]}
              />
              <Text style={styles.evidenceTitle}>{selectedLesion.type.toUpperCase()}</Text>
              <View style={styles.confidenceChip}>
                <Text style={styles.confidenceChipText}>
                  {Math.round(selectedLesion.confidence * 100)}% CONFIDENCE
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={() => setSelectedLesion(null)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.closeButton}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.evidenceMetaRow}>
            <Text style={styles.evidenceMetaLabel}>LOCATION:</Text>
            <Text style={styles.evidenceMetaValue}>{selectedLesion.location}</Text>
          </View>

          <Text style={styles.evidenceExplanationText}>
            {selectedLesion.explanation}
          </Text>
        </View>
      )}

      {/* Layer legend / guide */}
      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendIndicator, { backgroundColor: Colors.primaryLight }]} />
          <Text style={styles.legendLabel}>MA</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendIndicator, { backgroundColor: Colors.danger }]} />
          <Text style={styles.legendLabel}>HEM</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendIndicator, { backgroundColor: Colors.accentGold }]} />
          <Text style={styles.legendLabel}>HEX</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendIndicator, { backgroundColor: '#E0A96D' }]} />
          <Text style={styles.legendLabel}>CWS</Text>
        </View>
        <Text style={styles.legendHint}>Tap markers to inspect evidence</Text>
      </View>

      {/* Evidence summary */}
      <View style={styles.evidenceSection}>
        <Text style={styles.evidenceLabel}>CLINICAL EVIDENCE SUMMARY</Text>
        <Text style={styles.evidenceText}>{evidenceSummary}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 0,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerAccent: {
    width: 3,
    height: 16,
    backgroundColor: Colors.accentGold,
  },
  headerText: {
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    color: Colors.textMuted,
    letterSpacing: Typography.trackUltraWide,
  },

  layerBar: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surfaceDark,
  },
  layerTabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.xs,
    paddingVertical: Spacing.xs,
    gap: Spacing.xs,
  },
  layerTab: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: 'transparent',
  },
  layerTabActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primaryDark,
  },
  layerTabText: {
    fontSize: 10,
    fontWeight: Typography.bold,
    color: Colors.textSecondary,
    letterSpacing: Typography.trackWide,
  },
  layerTabTextActive: {
    color: Colors.textInverse,
  },

  viewerContainer: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#000000',
    overflow: 'hidden',
    position: 'relative',
  },
  retinaStage: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  retinaImage: {
    width: '100%',
    height: '100%',
  },
  placeholderStage: {
    width: '100%',
    height: '100%',
    backgroundColor: Colors.neutral200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    color: Colors.textMuted,
    letterSpacing: Typography.trackWide,
  },

  enhancedFilterOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(20, 80, 45, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(212, 168, 83, 0.25)',
  },

  heatmapImageOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.55,
  },
  syntheticHeatmapOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  heatmapHotspot1: {
    position: 'absolute',
    left: '30%',
    top: '26%',
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(196, 43, 43, 0.42)',
  },
  heatmapHotspot2: {
    position: 'absolute',
    left: '46%',
    top: '40%',
    width: 75,
    height: 75,
    borderRadius: 37,
    backgroundColor: 'rgba(212, 168, 83, 0.38)',
  },
  heatmapHotspot3: {
    position: 'absolute',
    left: '58%',
    top: '56%',
    width: 65,
    height: 65,
    borderRadius: 32,
    backgroundColor: 'rgba(184, 92, 0, 0.35)',
  },

  vesselOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  opticDiscCenter: {
    position: 'absolute',
    left: '68%',
    top: '45%',
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#38ef7d',
    backgroundColor: 'rgba(56, 239, 125, 0.15)',
  },
  vesselArchSuperior: {
    position: 'absolute',
    left: '26%',
    top: '20%',
    width: 170,
    height: 100,
    borderTopWidth: 2,
    borderLeftWidth: 1.5,
    borderColor: '#2ed573',
    borderRadius: 70,
    transform: [{ rotate: '-15deg' }],
  },
  vesselArchInferior: {
    position: 'absolute',
    left: '28%',
    top: '52%',
    width: 160,
    height: 90,
    borderBottomWidth: 2,
    borderLeftWidth: 1.5,
    borderColor: '#2ed573',
    borderRadius: 60,
    transform: [{ rotate: '15deg' }],
  },
  vesselBranchTemporal: {
    position: 'absolute',
    left: '42%',
    top: '36%',
    width: 80,
    height: 40,
    borderTopWidth: 1.5,
    borderColor: '#7bed9f',
    transform: [{ rotate: '-8deg' }],
  },
  vesselBranchNasal: {
    position: 'absolute',
    left: '65%',
    top: '50%',
    width: 60,
    height: 40,
    borderBottomWidth: 1.5,
    borderColor: '#7bed9f',
    transform: [{ rotate: '25deg' }],
  },

  lesionMarker: {
    position: 'absolute',
    width: 32,
    height: 32,
    marginLeft: -16,
    marginTop: -16,
    borderWidth: 1.5,
    borderRadius: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(26, 14, 8, 0.75)',
  },
  lesionMarkerSelected: {
    borderWidth: 2.5,
    backgroundColor: 'rgba(26, 14, 8, 0.95)',
    transform: [{ scale: 1.2 }],
    zIndex: 10,
  },
  lesionDot: {
    width: 6,
    height: 6,
    borderRadius: 0,
    marginBottom: 1,
  },
  lesionDotSelected: {
    width: 8,
    height: 8,
  },
  lesionBadgeText: {
    fontSize: 7,
    fontWeight: Typography.bold,
    letterSpacing: 0.5,
  },

  layerWatermark: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    backgroundColor: 'rgba(26, 14, 8, 0.8)',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  layerWatermarkText: {
    fontSize: 9,
    fontWeight: Typography.bold,
    color: Colors.accentGold,
    letterSpacing: Typography.trackWide,
  },

  evidencePanel: {
    backgroundColor: Colors.surfaceDark,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.base,
  },
  evidencePanelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  evidenceTypeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  evidenceColorPill: {
    width: 10,
    height: 10,
    borderRadius: 0,
  },
  evidenceTitle: {
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
    color: Colors.textPrimary,
    letterSpacing: Typography.trackWide,
  },
  confidenceChip: {
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  confidenceChipText: {
    fontSize: 9,
    fontWeight: Typography.bold,
    color: Colors.primary,
    letterSpacing: Typography.trackWide,
  },
  closeButton: {
    fontSize: 14,
    color: Colors.textMuted,
    paddingHorizontal: Spacing.xs,
  },
  evidenceMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  evidenceMetaLabel: {
    fontSize: 10,
    fontWeight: Typography.bold,
    color: Colors.textMuted,
    letterSpacing: Typography.trackWide,
  },
  evidenceMetaValue: {
    fontSize: Typography.xs,
    fontWeight: Typography.semibold,
    color: Colors.textSecondary,
  },
  evidenceExplanationText: {
    fontSize: Typography.xs,
    color: Colors.textPrimary,
    lineHeight: 18,
  },

  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
    backgroundColor: Colors.surface,
    gap: Spacing.md,
    flexWrap: 'wrap',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendIndicator: {
    width: 7,
    height: 7,
    borderRadius: 0,
  },
  legendLabel: {
    fontSize: 9,
    fontWeight: Typography.bold,
    color: Colors.textMuted,
    letterSpacing: Typography.trackWide,
  },
  legendHint: {
    fontSize: 9,
    color: Colors.textMuted,
    fontStyle: 'italic',
    marginLeft: 'auto',
  },

  evidenceSection: {
    padding: Spacing.base,
  },
  evidenceLabel: {
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    color: Colors.textMuted,
    letterSpacing: Typography.trackUltraWide,
    marginBottom: Spacing.sm,
  },
  evidenceText: {
    fontSize: Typography.sm,
    color: Colors.textPrimary,
    lineHeight: 20,
  },
});
