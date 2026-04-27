import 'package:flutter/material.dart';

/// 화면 크기 카테고리.
enum ScreenSize { mobile, tablet, desktop }

/// 브레이크포인트:
/// - mobile : < 600px
/// - tablet : 600 ~ 1023px
/// - desktop: >= 1024px
extension BreakpointX on BuildContext {
  double get screenWidth => MediaQuery.of(this).size.width;

  ScreenSize get screenSize {
    final w = screenWidth;
    if (w < 600) return ScreenSize.mobile;
    if (w < 1024) return ScreenSize.tablet;
    return ScreenSize.desktop;
  }

  bool get isMobile => screenSize == ScreenSize.mobile;
  bool get isTablet => screenSize == ScreenSize.tablet;
  bool get isDesktop => screenSize == ScreenSize.desktop;

  /// 모바일이 아닌 모든 환경 (태블릿 + 데스크탑).
  bool get isWide => !isMobile;
}

/// 화면 크기에 따라 다른 위젯을 빌드한다.
/// `tablet`/`desktop` 미지정 시 한 단계 작은 레이아웃을 사용한다.
class ResponsiveLayout extends StatelessWidget {
  const ResponsiveLayout({
    super.key,
    required this.mobile,
    this.tablet,
    this.desktop,
  });

  final Widget mobile;
  final Widget? tablet;
  final Widget? desktop;

  @override
  Widget build(BuildContext context) {
    final size = context.screenSize;
    return switch (size) {
      ScreenSize.desktop => desktop ?? tablet ?? mobile,
      ScreenSize.tablet => tablet ?? mobile,
      ScreenSize.mobile => mobile,
    };
  }
}

/// 콘텐츠를 가운데 정렬하고 최대 너비를 제한하는 래퍼.
/// 폼/리스트가 데스크탑에서 좌우로 너무 늘어나는 것을 방지.
class MaxWidthBox extends StatelessWidget {
  const MaxWidthBox({
    super.key,
    required this.child,
    this.maxWidth = 480,
    this.padding = EdgeInsets.zero,
  });

  final Widget child;
  final double maxWidth;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: maxWidth),
        child: Padding(padding: padding, child: child),
      ),
    );
  }
}
