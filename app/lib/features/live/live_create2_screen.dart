import 'package:flutter/material.dart';
import '../../app_theme.dart';
import '../../models/live.dart';
import '../../models/user.dart';
import '../../services/api_service.dart';
import 'live_screen.dart';

class LiveCreate2Screen extends StatefulWidget {
  const LiveCreate2Screen({super.key, required this.user});
  final User user;

  @override
  State<LiveCreate2Screen> createState() => _LiveCreate2ScreenState();
}

class _LiveCreate2ScreenState extends State<LiveCreate2Screen> {
  final _tags = ['산지직송', '유기농', '친환경', '당일수확', '냉장배송', '산지한정', '제철상품', '소량정품', '산지경매'];
  final _selectedTags = <String>{};
  int _liveType = 0; // 0=일반, 1=테스트
  int _guestAllowed = 0; // 0=허용, 1=비허용
  bool _launching = false;

  Future<void> _startLiveNow() async {
    setState(() => _launching = true);
    try {
      final api = ApiService();
      final data = await api.createLive(
        sellerId: widget.user.id,
        title: '라이브 방송',
      );
      final tokenData = await api.getToken(
        roomName: data['id'].toString(),
        userId: widget.user.id,
        role: 'seller',
      );
      if (!mounted) return;
      final live = Live(
        id: data['id'].toString(),
        sellerId: widget.user.id,
        title: '라이브 방송',
        status: 'live',
        viewerCount: 0,
        createdAt: '',
      );
      await Navigator.of(context).pushReplacement(MaterialPageRoute(
        builder: (_) => LiveScreen(
          live: live,
          user: widget.user,
          liveToken: tokenData['token'] as String,
          serverUrl: tokenData['serverUrl'] as String,
        ),
      ));
    } catch (e) {
      if (!mounted) return;
      setState(() => _launching = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('라이브 시작 실패: $e')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        backgroundColor: AppColors.bg,
        title: const Text(
          '라이브 만들기',
          style: TextStyle(fontSize: 17, fontWeight: FontWeight.w600, color: AppColors.ink),
        ),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new, size: 18, color: AppColors.inkSoft),
          onPressed: () => Navigator.of(context).pop(),
        ),
      ),
      body: Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                // Start time
                const Text(
                  '라이브 시작 시간',
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.ink),
                ),
                const SizedBox(height: 10),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
                  decoration: BoxDecoration(
                    color: AppColors.surface,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Row(
                    children: [
                      Icon(Icons.calendar_today_outlined, size: 16, color: AppColors.inkMute),
                      SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          '지금 바로 시작',
                          style: TextStyle(fontSize: 14, color: AppColors.inkMute),
                        ),
                      ),
                      Icon(Icons.chevron_right, size: 18, color: AppColors.inkMute),
                    ],
                  ),
                ),
                const SizedBox(height: 20),

                // Anti-collusion banner
                _InfoBanner(
                  icon: Icons.warning_amber_outlined,
                  text: '담합 행위는 경매 공정성을 해치며, 적발 시 서비스 이용이 제한됩니다.',
                  color: AppColors.warn,
                ),
                const SizedBox(height: 20),

                // Tags
                const Text(
                  '태그 설정',
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.ink),
                ),
                const SizedBox(height: 4),
                const Text(
                  '최대 3개까지 선택 가능해요',
                  style: TextStyle(fontSize: 12, color: AppColors.inkMute),
                ),
                const SizedBox(height: 10),
                GridView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 3,
                    childAspectRatio: 2.8,
                    crossAxisSpacing: 8,
                    mainAxisSpacing: 8,
                  ),
                  itemCount: _tags.length,
                  itemBuilder: (_, i) {
                    final tag = _tags[i];
                    final selected = _selectedTags.contains(tag);
                    return GestureDetector(
                      onTap: () {
                        setState(() {
                          if (selected) {
                            _selectedTags.remove(tag);
                          } else if (_selectedTags.length < 3) {
                            _selectedTags.add(tag);
                          }
                        });
                      },
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 150),
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: selected ? AppColors.accent : AppColors.surface,
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(
                            color: selected ? AppColors.accent : AppColors.line,
                          ),
                        ),
                        child: Text(
                          '#$tag',
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
                            color: selected ? AppColors.primaryInk : AppColors.inkSoft,
                          ),
                        ),
                      ),
                    );
                  },
                ),
                const SizedBox(height: 20),

                // Live type segmented
                const Text(
                  '라이브 종류',
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.ink),
                ),
                const SizedBox(height: 10),
                _SegmentedControl(
                  options: const ['일반', '테스트'],
                  selected: _liveType,
                  onChanged: (v) => setState(() => _liveType = v),
                ),
                const SizedBox(height: 20),

                // Guest access segmented
                const Text(
                  '비로그인 입장',
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.ink),
                ),
                const SizedBox(height: 10),
                _SegmentedControl(
                  options: const ['허용', '비허용'],
                  selected: _guestAllowed,
                  onChanged: (v) => setState(() => _guestAllowed = v),
                ),
                const SizedBox(height: 32),
              ],
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
              child: Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: _launching ? null : _startLiveNow,
                      style: OutlinedButton.styleFrom(
                        foregroundColor: AppColors.ink,
                        side: const BorderSide(color: AppColors.line),
                        minimumSize: const Size(double.infinity, 52),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                      child: _launching
                          ? const SizedBox(
                              height: 18,
                              width: 18,
                              child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.inkMute),
                            )
                          : const Text('라이브 바로 시작', style: TextStyle(fontWeight: FontWeight.w600)),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: ElevatedButton(
                      onPressed: _launching
                          ? null
                          : () => ScaffoldMessenger.of(context)
                              .showSnackBar(const SnackBar(content: Text('준비 중이에요'))),
                      child: const Text('라이브 예약'),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _SegmentedControl extends StatelessWidget {
  const _SegmentedControl({
    required this.options,
    required this.selected,
    required this.onChanged,
  });

  final List<String> options;
  final int selected;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        color: AppColors.surfaceAlt,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        children: List.generate(options.length, (i) {
          final active = selected == i;
          return Expanded(
            child: GestureDetector(
              onTap: () => onChanged(i),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 150),
                padding: const EdgeInsets.symmetric(vertical: 9),
                decoration: BoxDecoration(
                  color: active ? AppColors.surface : Colors.transparent,
                  borderRadius: BorderRadius.circular(8),
                ),
                alignment: Alignment.center,
                child: Text(
                  options[i],
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: active ? FontWeight.w600 : FontWeight.w400,
                    color: active ? AppColors.ink : AppColors.inkMute,
                  ),
                ),
              ),
            ),
          );
        }),
      ),
    );
  }
}

class _InfoBanner extends StatelessWidget {
  const _InfoBanner({required this.icon, required this.text, required this.color});
  final IconData icon;
  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 16, color: color),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              text,
              style: const TextStyle(fontSize: 12, color: AppColors.inkSoft, height: 1.5),
            ),
          ),
        ],
      ),
    );
  }
}
