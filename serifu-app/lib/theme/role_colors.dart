import 'dart:ui';

import 'app_theme.dart';

/// 役のバッジ/アバター配色。役のインデックス（characters内の位置）で
/// パレットを循環させ、どの台本でも役ごとに安定した配色にする。
/// （特定の役名に依存した判定はしないこと。）
const rolePalette = <({Color bg, Color fg})>[
  (bg: AppColors.roleTaroBg, fg: AppColors.roleTaroFg), // インディゴ
  (bg: AppColors.roleHanakoBg, fg: AppColors.roleHanakoFg), // ピンク
  (bg: AppColors.primary100, fg: AppColors.primary700),
  (bg: AppColors.accent050, fg: AppColors.accent600),
];

({Color bg, Color fg}) roleColors(int index) =>
    rolePalette[index < 0 ? 0 : index % rolePalette.length];
