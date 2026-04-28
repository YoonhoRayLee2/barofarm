import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

abstract class AppColors {
  // Background
  static const bg = Color(0xFF0E1A12);
  static const bgAlt = Color(0xFF142220);
  static const surface = Color(0xFF1A2A22);
  static const surfaceAlt = Color(0xFF22372D);

  // Ink
  static const ink = Color(0xFFEDF1E2);
  static const inkSoft = Color(0xFFB7C4A6);
  static const inkMute = Color(0xFF7E8675);
  static const line = Color(0xFF28392F);

  // Brand / Accent
  static const accent = Color(0xFF7AA53F);
  static const accentSoft = Color(0xFF5B7A35);

  // Semantic
  static const success = Color(0xFF7AA53F);
  static const warn = Color(0xFFD4A017);
  static const danger = Color(0xFFD6473A);
  static const info = Color(0xFF5C8BAE);
  static const cta = Color(0xFFD6473A);

  // Aliases for backwards compatibility
  static const primary = accent;
  static const primarySoft = accentSoft;
  static const primaryInk = Color(0xFF0E1A12);
  static const live = cta;
  static const warning = warn;
  static const card = surface;

  // Legacy: bid gradient kept for any existing use
  static const bidGradientStart = Color(0xFFFFD700);
  static const bidGradientEnd = Color(0xFFFF8C00);

  // Timer (kept for timer_display.dart)
  static const timerGreen = Color(0xFF7AA53F);
  static const timerAmber = Color(0xFFD4A017);
  static const timerRed = Color(0xFFD6473A);
}

ThemeData buildDarkTheme() => ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      scaffoldBackgroundColor: AppColors.bg,
      colorScheme: const ColorScheme.dark(
        primary: AppColors.accent,
        onPrimary: AppColors.primaryInk,
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
          borderRadius: BorderRadius.circular(14),
          side: const BorderSide(color: AppColors.line),
        ),
      ),
      dividerColor: AppColors.line,
      textTheme: GoogleFonts.notoSansKrTextTheme(_textTheme(AppColors.ink)),
      appBarTheme: const AppBarTheme(
        backgroundColor: AppColors.bg,
        foregroundColor: AppColors.ink,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.surface,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide.none,
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide.none,
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: AppColors.accent, width: 1.5),
        ),
        hintStyle: const TextStyle(color: AppColors.inkMute),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.cta,
          foregroundColor: Colors.white,
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          minimumSize: const Size(double.infinity, 52),
          textStyle:
              const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
        ),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: AppColors.bg,
        indicatorColor: Colors.transparent,
        iconTheme: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return const IconThemeData(color: AppColors.ink);
          }
          return const IconThemeData(color: AppColors.inkMute);
        }),
        labelTextStyle: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return const TextStyle(
                color: AppColors.ink,
                fontSize: 11,
                fontWeight: FontWeight.w500);
          }
          return const TextStyle(
              color: AppColors.inkMute,
              fontSize: 11,
              fontWeight: FontWeight.w500);
        }),
      ),
    );

ThemeData buildLightTheme() => buildDarkTheme();

TextTheme _textTheme(Color ink) => TextTheme(
      // Display L: 32px / w700 / lh 1.1 — Gowun Dodum
      displayLarge: GoogleFonts.gowunDodum(
          fontSize: 32, fontWeight: FontWeight.w700, height: 1.1, color: ink),
      // Display M: 24px / w700 / lh 1.2 — Gowun Dodum
      displayMedium: GoogleFonts.gowunDodum(
          fontSize: 24, fontWeight: FontWeight.w700, height: 1.2, color: ink),
      // Headline: 20px / w600 / lh 1.3
      headlineLarge: TextStyle(
          fontSize: 20,
          fontWeight: FontWeight.w600,
          height: 1.3,
          color: ink),
      headlineMedium: TextStyle(
          fontSize: 20,
          fontWeight: FontWeight.w600,
          height: 1.3,
          color: ink),
      headlineSmall: TextStyle(
          fontSize: 20,
          fontWeight: FontWeight.w600,
          height: 1.3,
          color: ink),
      // Body L: 16px / w400 / lh 1.55
      bodyLarge: TextStyle(
          fontSize: 16,
          fontWeight: FontWeight.w400,
          height: 1.55,
          color: ink),
      // Body M: 14px / w400 / lh 1.55
      bodyMedium: TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.w400,
          height: 1.55,
          color: ink),
      // Label: 12px / w500 / lh 1.4
      bodySmall: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w500,
          height: 1.4,
          color: ink),
      // Caption: 11px / w500 / mono spacing
      labelSmall: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w500,
          height: 1.4,
          letterSpacing: 0.5,
          color: ink),
    );
