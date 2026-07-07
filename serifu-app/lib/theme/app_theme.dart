import 'package:flutter/material.dart';

/// デザイントークン（design/00-foundation.html と一致）。
class AppColors {
  AppColors._();

  // Brand (blue)
  static const primary = Color(0xFF2563EB); // 500
  static const primary600 = Color(0xFF1D4ED8);
  static const primary700 = Color(0xFF1E40AF);
  static const primary400 = Color(0xFF60A5FA);
  static const primary100 = Color(0xFFDBEAFE);
  static const primary050 = Color(0xFFEFF6FF);

  // Accent (あなたの番 / amber)
  static const accent = Color(0xFFF5A623); // 500
  static const accent600 = Color(0xFFD98A12);
  static const accent200 = Color(0xFFFCE3B4);
  static const accent050 = Color(0xFFFFF7E9);
  static const onAccent = Color(0xFF3A2A00);

  // Stage (dark rehearsal / blue-slate)
  static const stage900 = Color(0xFF0F172A);
  static const stage800 = Color(0xFF1E293B);
  static const stage700 = Color(0xFF334155);
  static const stageText = Color(0xFFE2E8F0);
  static const stageMuted = Color(0xFF94A3B8);

  // Neutral (light / blue-slate)
  static const ink900 = Color(0xFF172033);
  static const ink700 = Color(0xFF334155);
  static const ink500 = Color(0xFF64748B);
  static const ink300 = Color(0xFF94A3B8);
  static const line = Color(0xFFE2E8F0);
  static const surface = Color(0xFFFFFFFF);
  static const bg = Color(0xFFF4F7FB);

  // States
  static const success = Color(0xFF2BB673);
  static const danger = Color(0xFFE5484D);

  // Role accents（1番目=ブルー、2番目=ピンク。role_colors.dart で循環）
  static const roleTaroBg = primary100;
  static const roleTaroFg = primary700;
  static const roleHanakoBg = Color(0xFFFCE4EE);
  static const roleHanakoFg = Color(0xFFC2456F);
}

/// 余白スケール（4/8/12/16/24/32）。
class AppSpacing {
  AppSpacing._();
  static const xs = 4.0;
  static const sm = 8.0;
  static const md = 12.0;
  static const lg = 16.0;
  static const xl = 24.0;
  static const xxl = 32.0;
}

/// 角丸（10/16/24/pill）。
class AppRadius {
  AppRadius._();
  static const sm = 10.0;
  static const md = 16.0;
  static const lg = 24.0;
  static const pill = 999.0;
}

/// 影 / エレベーション。
class AppShadows {
  AppShadows._();
  static const sm = [
    BoxShadow(color: Color(0x141C183C), blurRadius: 8, offset: Offset(0, 2)),
  ];
  static const md = [
    BoxShadow(color: Color(0x1F1C183C), blurRadius: 24, offset: Offset(0, 8)),
  ];
  static const lg = [
    BoxShadow(color: Color(0x2E1C183C), blurRadius: 40, offset: Offset(0, 16)),
  ];
}

/// 台本本文・手がかり用のテキストスタイル。
class AppText {
  AppText._();
  static const display =
      TextStyle(fontSize: 28, fontWeight: FontWeight.w800, color: AppColors.ink900);
  static const h1 =
      TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: AppColors.ink900);
  static const h2 =
      TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: AppColors.ink700);
  static const script =
      TextStyle(fontSize: 20, fontWeight: FontWeight.w600, height: 1.7, color: AppColors.ink900);
  static const body =
      TextStyle(fontSize: 15, fontWeight: FontWeight.w500, color: AppColors.ink900);
  static const caption =
      TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.ink500);
}

/// アプリ全体のテーマ。
class AppTheme {
  AppTheme._();

  static ThemeData light() {
    final scheme = ColorScheme.fromSeed(
      seedColor: AppColors.primary,
      brightness: Brightness.light,
    ).copyWith(
      primary: AppColors.primary,
      onPrimary: Colors.white,
      secondary: AppColors.accent,
      onSecondary: AppColors.onAccent,
      surface: AppColors.surface,
      onSurface: AppColors.ink900,
      error: AppColors.danger,
      outlineVariant: AppColors.line,
    );

    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      // 同梱の日本語フォント（w600/w800 は 500/700 に丸められて描画される）
      fontFamily: 'NotoSansJP',
      scaffoldBackgroundColor: AppColors.bg,
      splashFactory: InkRipple.splashFactory,
      appBarTheme: const AppBarTheme(
        backgroundColor: AppColors.bg,
        foregroundColor: AppColors.ink900,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        titleTextStyle:
            TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: AppColors.ink900),
      ),
      cardTheme: CardThemeData(
        color: AppColors.surface,
        elevation: 0,
        margin: EdgeInsets.zero,
        shadowColor: const Color(0x1F1C183C),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.md)),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.primary,
          foregroundColor: Colors.white,
          shape: const StadiumBorder(),
          padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 14),
          textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.primary,
          foregroundColor: Colors.white,
          elevation: 0,
          shape: const StadiumBorder(),
          padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 14),
          textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: AppColors.primary600,
          side: const BorderSide(color: AppColors.primary400, width: 1.5),
          shape: const StadiumBorder(),
          padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 14),
          textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(foregroundColor: AppColors.primary600),
      ),
      floatingActionButtonTheme: const FloatingActionButtonThemeData(
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
      ),
      chipTheme: ChipThemeData(
        backgroundColor: AppColors.surface,
        selectedColor: AppColors.primary,
        side: const BorderSide(color: AppColors.line, width: 1.5),
        labelStyle: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.ink700),
        secondaryLabelStyle: const TextStyle(fontWeight: FontWeight.w700, color: Colors.white),
        shape: const StadiumBorder(),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
      ),
      sliderTheme: const SliderThemeData(
        activeTrackColor: AppColors.primary,
        inactiveTrackColor: AppColors.line,
        thumbColor: AppColors.surface,
        overlayColor: Color(0x1F6C5CE7),
      ),
      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.resolveWith(
          (s) => s.contains(WidgetState.selected) ? Colors.white : AppColors.surface,
        ),
        trackColor: WidgetStateProperty.resolveWith(
          (s) => s.contains(WidgetState.selected) ? AppColors.primary : AppColors.line,
        ),
        trackOutlineColor: WidgetStateProperty.all(Colors.transparent),
      ),
      dividerTheme: const DividerThemeData(color: AppColors.line, thickness: 1),
      progressIndicatorTheme: const ProgressIndicatorThemeData(
        color: AppColors.primary,
        linearTrackColor: AppColors.line,
      ),
      segmentedButtonTheme: SegmentedButtonThemeData(
        style: ButtonStyle(
          shape: WidgetStatePropertyAll(
            RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.sm)),
          ),
          backgroundColor: WidgetStateProperty.resolveWith(
            (s) => s.contains(WidgetState.selected) ? AppColors.primary : AppColors.surface,
          ),
          foregroundColor: WidgetStateProperty.resolveWith(
            (s) => s.contains(WidgetState.selected) ? Colors.white : AppColors.ink700,
          ),
        ),
      ),
      snackBarTheme: const SnackBarThemeData(
        backgroundColor: AppColors.ink900,
        contentTextStyle: TextStyle(color: Colors.white),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }
}
