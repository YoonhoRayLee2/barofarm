// 플랫폼별 LiveViewWidget 진입점.
//
// - mobile/desktop: webview_flutter (`_live_view_mobile.dart`)
// - web           : iframe + HtmlElementView (`_live_view_web.dart`)
//
// 사용처는 항상 이 파일만 import 한다.
export '_live_view_mobile.dart' if (dart.library.html) '_live_view_web.dart';
