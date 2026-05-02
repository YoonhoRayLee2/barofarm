import 'dart:io' show Platform;
import 'package:flutter/foundation.dart' show kIsWeb;

/// 개발용 서버 베이스 URL.
///
/// 결정 로직(우선순위):
///   1) `--dart-define=BASE_URL=...` 가 있으면 그 값을 단독 사용
///   2) 그 외에는 [candidates] 의 후보 URL 들을 webview_shell 이
///      health 체크하여 첫 번째 도달 가능한 URL 을 채택
///
/// 후보 순서(가장 흔한 환경 우선):
///   - Android 에뮬: `10.0.2.2:3000` (호스트 Mac 으로의 NAT)
///   - 동일 LAN 내 Mac IP: `192.168.0.110:3000` (실기기 USB·Wi-Fi)
///   - `localhost:3000` (iOS 시뮬·웹·데스크톱)
///
/// **WebRTC secure context 주의:**
///   `getUserMedia` 는 HTTPS 또는 localhost 에서만 동작.
///   LAN IP(192.168.x) 로 붙으면 라이브 송출(셀러 카메라)은 동작하지 않으므로,
///   라이브 송출 테스트는 `adb reverse tcp:3000 tcp:3000` + BASE_URL=localhost 로 전환.
///
/// 일반 API/Socket 은 평문 HTTP 로도 정상 동작.
/// `AndroidManifest.usesCleartextTraffic=true`, iOS `NSAllowsArbitraryLoads=true` 이미 설정.
class AppConfig {
  static const String _override = String.fromEnvironment('BASE_URL', defaultValue: '');

  /// 동일 LAN 내 개발 머신(Mac) 의 IP. 네트워크가 바뀌면 이 값을 갱신할 것.
  static const String _devHostIp = '192.168.0.110';
  static const int _port = 3000;

  /// 후보 URL 목록 — 플랫폼별 우선순위 적용.
  static List<String> get candidates {
    if (_override.isNotEmpty) return [_override];

    final lanIp = 'http://$_devHostIp:$_port';
    final localhost = 'http://localhost:$_port';

    if (kIsWeb) return [localhost];

    try {
      if (Platform.isAndroid) {
        // 에뮬레이터: 10.0.2.2 가 호스트 Mac 의 localhost.
        // 실기기: 동일 Wi-Fi 의 LAN IP 가 도달 가능.
        return ['http://10.0.2.2:$_port', lanIp, localhost];
      }
      if (Platform.isIOS) {
        // 시뮬레이터: localhost 가능. 실기기: LAN IP.
        return [lanIp, localhost];
      }
    } catch (_) {
      // 웹 빌드 등 Platform 접근 불가 — fallthrough
    }
    return [localhost, lanIp];
  }

  /// 즉시 사용 가능한 단일 URL — 후보 첫 번째.
  /// 실제 사용 전에 반드시 [candidates] 를 health 체크해 [activeBaseUrl] 로
  /// 갱신할 것을 권장.
  static String get baseUrl => candidates.first;

  /// webview_shell 이 health 체크 후 채택한 URL 을 저장. 다른 헬퍼에서 참조 가능.
  static String activeBaseUrl = '';
}
