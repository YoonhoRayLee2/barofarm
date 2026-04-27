import 'package:flutter/material.dart';

// Fresh Field (B) palette — ds-themes.jsx: freshField
abstract class AppColors {
  // Light
  static const bg = Color(0xFFF4F2EA);
  static const bgAlt = Color(0xFFEAE7D8);
  static const surface = Color(0xFFFFFFFF);
  static const surfaceAlt = Color(0xFFEFEDDF);
  static const ink = Color(0xFF1F2417);
  static const inkSoft = Color(0xFF475040);
  static const inkMute = Color(0xFF7E8675);
  static const line = Color(0xFFDCDCC9);
  static const accent = Color(0xFF5B7A35);
  static const accentSoft = Color(0xFFC9D8A8);
  static const accentInk = Color(0xFFFFFFFF);
  static const success = Color(0xFF5B7A35);
  static const warning = Color(0xFFB58A2B);
  static const danger = Color(0xFFB23A2C);
  static const live = Color(0xFFB23A2C);

  // Dark
  static const darkBg = Color(0xFF11140D);
  static const darkBgAlt = Color(0xFF171B12);
  static const darkSurface = Color(0xFF1F2417);
  static const darkSurfaceAlt = Color(0xFF272E1D);
  static const darkInk = Color(0xFFEEF0E4);
  static const darkInkSoft = Color(0xFFB8BFA6);
  static const darkInkMute = Color(0xFF7E8675);
  static const darkLine = Color(0xFF2E3525);
  static const darkAccent = Color(0xFFA8C766);
  static const darkAccentSoft = Color(0xFF2E3D17);
  static const darkAccentInk = Color(0xFF11140D);
}

ThemeData buildLightTheme() => ThemeData(
      useMaterial3: true,
      scaffoldBackgroundColor: AppColors.bg,
      colorScheme: const ColorScheme.light(
        primary: AppColors.accent,
        onPrimary: AppColors.accentInk,
        secondary: AppColors.accentSoft,
        onSecondary: AppColors.ink,
        surface: AppColors.surface,
        onSurface: AppColors.ink,
        error: AppColors.danger,
        outline: AppColors.line,
      ),
      cardTheme: CardTheme(
        color: AppColors.surface,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(8),
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
          borderSide: const BorderSide(color: AppColors.accent, width: 1.5),
        ),
        hintStyle: const TextStyle(color: AppColors.inkMute),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.accent,
          foregroundColor: AppColors.accentInk,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
          minimumSize: const Size(double.infinity, 52),
          textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
        ),
      ),
    );

ThemeData buildDarkTheme() => ThemeData(
      useMaterial3: true,
      scaffoldBackgroundColor: AppColors.darkBg,
      colorScheme: const ColorScheme.dark(
        primary: AppColors.darkAccent,
        onPrimary: AppColors.darkAccentInk,
        secondary: AppColors.darkAccentSoft,
        onSecondary: AppColors.darkInk,
        surface: AppColors.darkSurface,
        onSurface: AppColors.darkInk,
        error: AppColors.danger,
        outline: AppColors.darkLine,
      ),
      cardTheme: CardTheme(
        color: AppColors.darkSurface,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(8),
          side: const BorderSide(color: AppColors.darkLine),
        ),
      ),
      dividerColor: AppColors.darkLine,
      textTheme: _textTheme(AppColors.darkInk),
      appBarTheme: const AppBarTheme(
        backgroundColor: AppColors.darkBg,
        foregroundColor: AppColors.darkInk,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.darkSurface,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: const BorderSide(color: AppColors.darkLine),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: const BorderSide(color: AppColors.darkLine),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: const BorderSide(color: AppColors.darkAccent, width: 1.5),
        ),
        hintStyle: const TextStyle(color: AppColors.darkInkMute),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.darkAccent,
          foregroundColor: AppColors.darkAccentInk,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
          minimumSize: const Size(double.infinity, 52),
          textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
        ),
      ),
    );

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
