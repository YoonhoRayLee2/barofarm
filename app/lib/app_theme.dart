import 'package:flutter/material.dart';

abstract class AppColors {
  // Background
  static const bg = Color(0xFF0A0F0D);
  static const bgAlt = Color(0xFF111916);
  static const surface = Color(0xFF111916);
  static const card = Color(0xFF182218);

  // Ink
  static const ink = Color(0xFFFFFFFF);
  static const inkSoft = Color(0xFFB8C4B0);
  static const inkMute = Color(0xFF6B7A65);
  static const line = Color(0xFF1E2A1E);

  // Brand
  static const primary = Color(0xFF22C55E);
  static const primarySoft = Color(0xFF166534);
  static const primaryInk = Color(0xFF0A0F0D);

  // Bid button gradient
  static const bidGradientStart = Color(0xFFFFD700);
  static const bidGradientEnd = Color(0xFFFF8C00);

  // Semantic
  static const live = Color(0xFFFF3B3B);
  static const success = Color(0xFF22C55E);
  static const warning = Color(0xFFF59E0B);
  static const danger = Color(0xFFEF4444);

  // Timer
  static const timerGreen = Color(0xFF22C55E);
  static const timerAmber = Color(0xFFF59E0B);
  static const timerRed = Color(0xFFEF4444);
}

ThemeData buildDarkTheme() => ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      scaffoldBackgroundColor: AppColors.bg,
      colorScheme: const ColorScheme.dark(
        primary: AppColors.primary,
        onPrimary: AppColors.primaryInk,
        secondary: AppColors.primarySoft,
        onSecondary: AppColors.ink,
        surface: AppColors.surface,
        onSurface: AppColors.ink,
        error: AppColors.danger,
        outline: AppColors.line,
      ),
      cardTheme: CardTheme(
        color: AppColors.card,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: const BorderSide(color: AppColors.line),
        ),
      ),
      dividerColor: AppColors.line,
      textTheme: _textTheme(AppColors.ink),
      appBarTheme: const AppBarTheme(
        backgroundColor: AppColors.bg,
        foregroundColor: AppColors.ink,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.surface,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: const BorderSide(color: AppColors.line),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: const BorderSide(color: AppColors.line),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: const BorderSide(color: AppColors.primary, width: 1.5),
        ),
        hintStyle: const TextStyle(color: AppColors.inkMute),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.primary,
          foregroundColor: AppColors.primaryInk,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
          minimumSize: const Size(double.infinity, 52),
          textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
        ),
      ),
    );

// Light theme은 dark 기반으로 동일하게 유지 (앱이 다크 모드 전용)
ThemeData buildLightTheme() => buildDarkTheme();

TextTheme _textTheme(Color ink) => TextTheme(
      displayLarge: TextStyle(fontSize: 56, fontWeight: FontWeight.w700, height: 1.05, letterSpacing: -0.02 * 56, color: ink),
      displayMedium: TextStyle(fontSize: 40, fontWeight: FontWeight.w700, height: 1.1, letterSpacing: -0.02 * 40, color: ink),
      headlineLarge: TextStyle(fontSize: 28, fontWeight: FontWeight.w700, height: 1.2, letterSpacing: -0.01 * 28, color: ink),
      headlineMedium: TextStyle(fontSize: 22, fontWeight: FontWeight.w600, height: 1.25, letterSpacing: -0.01 * 22, color: ink),
      headlineSmall: TextStyle(fontSize: 18, fontWeight: FontWeight.w600, height: 1.3, color: ink),
      bodyLarge: TextStyle(fontSize: 16, fontWeight: FontWeight.w400, height: 1.55, color: ink),
      bodyMedium: TextStyle(fontSize: 14, fontWeight: FontWeight.w400, height: 1.55, color: ink),
      bodySmall: TextStyle(fontSize: 12, fontWeight: FontWeight.w500, height: 1.4, letterSpacing: 0.02 * 12, color: ink),
      labelSmall: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, height: 1.2, letterSpacing: 0.08 * 11, color: ink),
    );
