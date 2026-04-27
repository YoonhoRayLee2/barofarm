import 'dart:async';
import 'dart:math';
import 'package:flutter/material.dart';
import '../../app_theme.dart';
import '../../models/message.dart';
import 'widgets/timer_display.dart';
import 'widgets/chat_overlay.dart';

// ─── 더미 데이터 ──────────────────────────────────────────────────────────────

const _kSellerId = '바로팜_농부김씨';
const _kProductName = '제주 감귤 10kg 특품 🍊';
const _kStartPrice = 15000;
const _kInitPrice = 23000;
const _kInitTimeLeft = 180; // 3분

final _kFakeChats = [
  ('감귤러버', '이거 진짜 신선한가요?'),
  ('제주사람', '저 작년에도 샀는데 완전 달았어요 ㅠㅠ'),
  ('농산물마니아', '배송 얼마나 걸려요?'),
  ('딸기도좋아', '가격 더 오르기 전에 빨리 눌러야겠다'),
  ('건강한삶', '비타민C 폭발이죠 ㅎㅎ'),
  ('감귤러버', '제주 직송이죠?'),
  ('엄마사랑', '우리 엄마 선물로 딱이다 🥰'),
  ('과일덕후', '한 박스 더 살까 고민 중...'),
  ('제주사람', '가격 완전 착하다'),
  ('건강한삶', '특품이면 당도 얼마나 돼요?'),
];

final _kFakeBidders = ['감귤마니아', '제주사랑', '과일덕후', '새벽배송왕', '감귤러버'];

// ─── Screen ───────────────────────────────────────────────────────────────────

class SampleAuctionScreen extends StatefulWidget {
  const SampleAuctionScreen({super.key});

  @override
  State<SampleAuctionScreen> createState() => _SampleAuctionScreenState();
}

class _SampleAuctionScreenState extends State<SampleAuctionScreen>
    with TickerProviderStateMixin {
  int _currentPrice = _kInitPrice;
  int _timeLeft = _kInitTimeLeft;
  String? _topBidder = '감귤마니아';
  int _viewerCount = 47;
  bool _auctionEnded = false;
  bool _isMuted = false;
  bool _isFollowing = false;
  bool _chatFocused = false;

  final List<ChatMessage> _messages = [];
  final TextEditingController _chatCtrl = TextEditingController();
  final FocusNode _chatFocus = FocusNode();

  late final AnimationController _bgCtrl;
  Timer? _tickTimer;
  Timer? _chatTimer;
  Timer? _bidTimer;
  int _chatIdx = 0;
  final _rng = Random();

  static const double _panelH = 182.0;
  static const double _chatBarH = 56.0;

  @override
  void initState() {
    super.initState();

    // 배경 그라디언트 애니메이션
    _bgCtrl = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 6),
    )..repeat(reverse: true);

    // 초기 채팅 몇 개 넣어두기
    _messages.addAll([
      ChatMessage(ts: DateTime.now().millisecondsSinceEpoch, userId: '감귤러버', message: '오늘 방송 기다렸어요!'),
      ChatMessage(ts: DateTime.now().millisecondsSinceEpoch, userId: '제주사람', message: '특품 감귤 나왔다!!'),
      ChatMessage(ts: DateTime.now().millisecondsSinceEpoch, userId: '농산물마니아', message: '가격 너무 착하다 ㅠ'),
    ]);

    _chatFocus.addListener(() {
      if (mounted) setState(() => _chatFocused = _chatFocus.hasFocus);
    });

    _startTimers();
  }

  void _startTimers() {
    // 1초마다 카운트다운
    _tickTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      setState(() {
        if (_timeLeft > 0) {
          _timeLeft--;
          // 시청자수 소폭 변동
          if (_rng.nextBool()) _viewerCount += _rng.nextInt(3) - 1;
          _viewerCount = _viewerCount.clamp(30, 120);
        } else {
          _auctionEnded = true;
          _tickTimer?.cancel();
          _chatTimer?.cancel();
          _bidTimer?.cancel();
        }
      });
    });

    // 3~5초마다 가짜 채팅
    _scheduleFakeChat();

    // 20~35초마다 가짜 입찰
    _scheduleFakeBid();
  }

  void _scheduleFakeChat() {
    final delay = Duration(seconds: 3 + _rng.nextInt(3));
    _chatTimer = Timer(delay, () {
      if (!mounted || _auctionEnded) return;
      final (uid, msg) = _kFakeChats[_chatIdx % _kFakeChats.length];
      _chatIdx++;
      setState(() => _messages.add(ChatMessage(ts: DateTime.now().millisecondsSinceEpoch, userId: uid, message: msg)));
      _scheduleFakeChat();
    });
  }

  void _scheduleFakeBid() {
    final delay = Duration(seconds: 20 + _rng.nextInt(16));
    _bidTimer = Timer(delay, () {
      if (!mounted || _auctionEnded) return;
      final bidder = _kFakeBidders[_rng.nextInt(_kFakeBidders.length)];
      final inc = ((_rng.nextInt(5) + 1) * 500);
      setState(() {
        _currentPrice += inc;
        _topBidder = bidder;
        _messages.add(ChatMessage(
          userId: 'SYSTEM',
          message: '$bidder님이 ${_fmt(_currentPrice)}원에 입찰했어요!',
        ));
      });
      _scheduleFakeBid();
    });
  }

  void _onBid() {
    setState(() {
      _currentPrice += 1000;
      _topBidder = '나';
      _messages.add(ChatMessage(
        userId: 'SYSTEM',
        message: '${_fmt(_currentPrice)}원에 입찰했어요!',
      ));
    });
  }

  void _onSendChat() {
    final text = _chatCtrl.text.trim();
    if (text.isEmpty) return;
    setState(() => _messages.add(ChatMessage(ts: DateTime.now().millisecondsSinceEpoch, userId: '나', message: text)));
    _chatCtrl.clear();
  }

  @override
  void dispose() {
    _bgCtrl.dispose();
    _tickTimer?.cancel();
    _chatTimer?.cancel();
    _bidTimer?.cancel();
    _chatCtrl.dispose();
    _chatFocus.dispose();
    super.dispose();
  }

  String _fmt(int p) => p
      .toString()
      .replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (m) => '${m[1]},');

  @override
  Widget build(BuildContext context) {
    final kb = MediaQuery.of(context).viewInsets.bottom;
    final safeBottom = MediaQuery.of(context).padding.bottom;
    final totalBottomH = _panelH + _chatBarH + safeBottom;

    return Scaffold(
      backgroundColor: Colors.black,
      resizeToAvoidBottomInset: false,
      body: Stack(
        children: [
          // L0: 애니메이션 배경 (WebView 대체)
          Positioned.fill(child: _AnimatedFarmBackground(ctrl: _bgCtrl)),

          // L1: 상단 바
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: _TopBar(
              sellerId: _kSellerId,
              productName: _kProductName,
              viewerCount: _viewerCount,
              isMuted: _isMuted,
              isFollowing: _isFollowing,
              onMuteTap: () => setState(() => _isMuted = !_isMuted),
              onFollowTap: () => setState(() => _isFollowing = !_isFollowing),
              onClose: () => Navigator.of(context).pop(),
            ),
          ),

          // L2: 채팅 + 현재 최고가
          if (!_auctionEnded)
            Positioned(
              left: 0,
              right: 0,
              bottom: kb + totalBottomH + 4,
              height: 200,
              child: Column(
                mainAxisAlignment: MainAxisAlignment.end,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Align(
                      alignment: Alignment.bottomLeft,
                      child: SizedBox(
                        width: MediaQuery.of(context).size.width * 0.72,
                        child: ChatOverlay(messages: _messages),
                      ),
                    ),
                  ),
                  if (_topBidder != null)
                    Padding(
                      padding: const EdgeInsets.fromLTRB(12, 4, 12, 4),
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 10, vertical: 5),
                        decoration: BoxDecoration(
                          color: Colors.black54,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: RichText(
                          text: TextSpan(
                            children: [
                              const TextSpan(
                                text: '현재 최고가  ',
                                style: TextStyle(
                                    color: Colors.white70, fontSize: 12),
                              ),
                              TextSpan(
                                text: _topBidder!,
                                style: const TextStyle(
                                  color: AppColors.primary,
                                  fontSize: 12,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),

          // L3: 하단 패널
          if (!_auctionEnded)
            Positioned(
              bottom: kb,
              left: 0,
              right: 0,
              child: _BottomPanel(
                currentPrice: _currentPrice,
                startPrice: _kStartPrice,
                timeLeft: _timeLeft,
                productName: _kProductName,
                safeBottom: safeBottom,
                chatFocused: _chatFocused,
                chatCtrl: _chatCtrl,
                chatFocus: _chatFocus,
                onBid: _onBid,
                onSendChat: _onSendChat,
                fmt: _fmt,
              ),
            ),

          // L4: 경매 종료 오버레이
          if (_auctionEnded)
            Positioned.fill(
              child: Container(
                color: Colors.black54,
                child: Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.gavel, color: Colors.white, size: 48),
                      const SizedBox(height: 16),
                      const Text(
                        '경매 종료',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 28,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        '최종 낙찰가: ${_fmt(_currentPrice)}원',
                        style: const TextStyle(
                            color: Colors.white70, fontSize: 16),
                      ),
                      if (_topBidder != null)
                        Padding(
                          padding: const EdgeInsets.only(top: 4),
                          child: Text(
                            '낙찰자: $_topBidder',
                            style: const TextStyle(
                                color: Colors.white70, fontSize: 14),
                          ),
                        ),
                      const SizedBox(height: 32),
                      ElevatedButton(
                        onPressed: () => Navigator.of(context).pop(),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppColors.live,
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(
                              horizontal: 32, vertical: 14),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(8),
                          ),
                        ),
                        child: const Text('나가기',
                            style: TextStyle(fontWeight: FontWeight.w600)),
                      ),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

// ─── 애니메이션 배경 ──────────────────────────────────────────────────────────

class _AnimatedFarmBackground extends StatelessWidget {
  const _AnimatedFarmBackground({required this.ctrl});
  final AnimationController ctrl;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: ctrl,
      builder: (_, __) {
        final t = ctrl.value;
        return Stack(
          fit: StackFit.expand,
          children: [
            // 배경 그라디언트
            Container(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [
                    Color.lerp(
                        const Color(0xFF0A2010), const Color(0xFF0D3018), t)!,
                    Color.lerp(
                        const Color(0xFF051008), const Color(0xFF081A0C), t)!,
                  ],
                ),
              ),
            ),
            // 감귤 이모지 + 상품 표시
            Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    '🍊',
                    style: TextStyle(
                      fontSize: 80 + t * 8,
                    ),
                  ),
                  const SizedBox(height: 16),
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 20, vertical: 10),
                    decoration: BoxDecoration(
                      color: Colors.black38,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Text(
                      '제주 감귤 10kg 특품',
                      style: TextStyle(
                        color: Colors.white70,
                        fontSize: 18,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            // 왼쪽 상단 "DEMO" 워터마크
            const Positioned(
              top: 80,
              right: 16,
              child: _DemoBadge(),
            ),
          ],
        );
      },
    );
  }
}

class _DemoBadge extends StatelessWidget {
  const _DemoBadge();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: Colors.black45,
        borderRadius: BorderRadius.circular(4),
        border: Border.all(color: Colors.white24),
      ),
      child: const Text(
        'DEMO',
        style: TextStyle(
          color: Colors.white38,
          fontSize: 10,
          fontWeight: FontWeight.w700,
          letterSpacing: 1.5,
        ),
      ),
    );
  }
}

// ─── Top Bar ──────────────────────────────────────────────────────────────────

class _TopBar extends StatelessWidget {
  const _TopBar({
    required this.sellerId,
    required this.productName,
    required this.viewerCount,
    required this.isMuted,
    required this.isFollowing,
    required this.onMuteTap,
    required this.onFollowTap,
    required this.onClose,
  });

  final String sellerId;
  final String productName;
  final int viewerCount;
  final bool isMuted;
  final bool isFollowing;
  final VoidCallback onMuteTap;
  final VoidCallback onFollowTap;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xCC000000), Colors.transparent],
        ),
      ),
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  // Avatar
                  Container(
                    width: 42,
                    height: 42,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: AppColors.primarySoft,
                      border: Border.all(color: AppColors.primary, width: 1.5),
                    ),
                    child: const Center(
                      child: Text('🌱', style: TextStyle(fontSize: 20)),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(
                                color: AppColors.primarySoft,
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: const Text(
                                '판매자',
                                style: TextStyle(
                                  color: Colors.white,
                                  fontSize: 10,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                            const SizedBox(width: 6),
                            Text(
                              sellerId,
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 14,
                                fontWeight: FontWeight.w700,
                                shadows: [Shadow(blurRadius: 4)],
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 1),
                        Text(
                          productName,
                          style: const TextStyle(
                              color: Colors.white60, fontSize: 12),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
                  ),
                  // LIVE + 시청자 + 닫기
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: AppColors.live,
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: const Text(
                          'LIVE',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 12,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 0.5,
                          ),
                        ),
                      ),
                      const SizedBox(width: 6),
                      const Icon(Icons.visibility,
                          color: Colors.white60, size: 13),
                      const SizedBox(width: 2),
                      Text(
                        '$viewerCount',
                        style: const TextStyle(
                            color: Colors.white60, fontSize: 13),
                      ),
                      const SizedBox(width: 10),
                      GestureDetector(
                        onTap: onClose,
                        child: Container(
                          padding: const EdgeInsets.all(4),
                          decoration: BoxDecoration(
                            color: Colors.black45,
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: const Icon(Icons.close,
                              color: Colors.white, size: 20),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  _Chip(
                    label: isMuted ? '소리켜기' : '소리끄기',
                    onTap: onMuteTap,
                  ),
                  const SizedBox(width: 8),
                  _Chip(
                    label: isFollowing ? '팔로잉' : '팔로우',
                    onTap: onFollowTap,
                    active: isFollowing,
                  ),
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 10, vertical: 6),
                    decoration: BoxDecoration(
                      color: Colors.black38,
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: AppColors.primary),
                    ),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.monetization_on,
                            color: AppColors.primary, size: 14),
                        SizedBox(width: 4),
                        Text(
                          '0',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ─── Bottom Panel ─────────────────────────────────────────────────────────────

class _BottomPanel extends StatelessWidget {
  const _BottomPanel({
    required this.currentPrice,
    required this.startPrice,
    required this.timeLeft,
    required this.productName,
    required this.safeBottom,
    required this.chatFocused,
    required this.chatCtrl,
    required this.chatFocus,
    required this.onBid,
    required this.onSendChat,
    required this.fmt,
  });

  final int currentPrice;
  final int startPrice;
  final int timeLeft;
  final String productName;
  final double safeBottom;
  final bool chatFocused;
  final TextEditingController chatCtrl;
  final FocusNode chatFocus;
  final VoidCallback onBid;
  final VoidCallback onSendChat;
  final String Function(int) fmt;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (!chatFocused)
          Container(
            color: const Color(0xD9000000),
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                // 판매 유형 + 타이머
                Row(
                  children: [
                    _SaleTag(label: '일반 경매'),
                    const SizedBox(width: 8),
                    TimerDisplay(timeLeft: timeLeft),
                  ],
                ),
                const SizedBox(height: 10),
                // 상품 카드
                Row(
                  children: [
                    Container(
                      width: 54,
                      height: 54,
                      decoration: BoxDecoration(
                        color: AppColors.primarySoft,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: const Center(
                        child: Text('🍊', style: TextStyle(fontSize: 28)),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            productName,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 14,
                              fontWeight: FontWeight.w600,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          const Text(
                            '+ 배송비 별도',
                            style: TextStyle(
                                color: Colors.white38, fontSize: 11),
                          ),
                        ],
                      ),
                    ),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          '${fmt(currentPrice)}원',
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 16,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        Text(
                          '시작가 ${fmt(startPrice)}원',
                          style: const TextStyle(
                              color: Colors.white38, fontSize: 10),
                        ),
                      ],
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                // 참여 버튼
                GestureDetector(
                  onTap: onBid,
                  child: Container(
                    width: double.infinity,
                    height: 52,
                    decoration: BoxDecoration(
                      color: AppColors.live,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text(
                          '${fmt(currentPrice + 1000)}원 참여',
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 17,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        const SizedBox(width: 6),
                        const Icon(Icons.double_arrow,
                            color: Colors.white, size: 18),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 10),
              ],
            ),
          ),
        // 채팅 입력바
        Container(
          color: const Color(0xEB000000),
          padding: EdgeInsets.fromLTRB(12, 8, 12, safeBottom + 8),
          child: Row(
            children: [
              Expanded(
                child: Container(
                  height: 40,
                  decoration: BoxDecoration(
                    color: Colors.white10,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: Colors.white24),
                  ),
                  child: TextField(
                    controller: chatCtrl,
                    focusNode: chatFocus,
                    style:
                        const TextStyle(color: Colors.white, fontSize: 14),
                    decoration: const InputDecoration(
                      hintText: '메시지 입력',
                      hintStyle:
                          TextStyle(color: Colors.white38, fontSize: 14),
                      border: InputBorder.none,
                      contentPadding: EdgeInsets.symmetric(
                          horizontal: 16, vertical: 10),
                    ),
                    textInputAction: TextInputAction.send,
                    onSubmitted: (_) => onSendChat(),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              GestureDetector(
                onTap: onSendChat,
                child: Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    color: Colors.white10,
                    borderRadius: BorderRadius.circular(18),
                  ),
                  child: const Icon(Icons.send_rounded,
                      color: Colors.white54, size: 18),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

// ─── 소형 위젯 ────────────────────────────────────────────────────────────────

class _Chip extends StatelessWidget {
  const _Chip({required this.label, required this.onTap, this.active = false});
  final String label;
  final VoidCallback onTap;
  final bool active;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: active ? Colors.white24 : Colors.black38,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: Colors.white38),
        ),
        child: Text(
          label,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 12,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
    );
  }
}

class _SaleTag extends StatelessWidget {
  const _SaleTag({required this.label});
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: Colors.white24,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white38),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.help_outline, color: Colors.white54, size: 12),
          const SizedBox(width: 4),
          Text(
            label,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 12,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}
