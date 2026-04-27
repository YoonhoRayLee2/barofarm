import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../app_theme.dart';
import '../../models/user.dart';
import '../../services/api_service.dart';
import '../../utils/responsive.dart';
import '../live/live_screen.dart';

class CreateAuctionScreen extends StatefulWidget {
  const CreateAuctionScreen({super.key, required this.user});
  final User user;

  @override
  State<CreateAuctionScreen> createState() => _CreateAuctionScreenState();
}

class _CreateAuctionScreenState extends State<CreateAuctionScreen> {
  final _formKey = GlobalKey<FormState>();
  final _productCtrl = TextEditingController();
  final _priceCtrl = TextEditingController();
  bool _submitting = false;

  @override
  void dispose() {
    _productCtrl.dispose();
    _priceCtrl.dispose();
    super.dispose();
  }

  Future<void> _onStart() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _submitting = true);
    try {
      final api = ApiService();
      final auction = await api.createAuction(
        sellerId: widget.user.id,
        productName: _productCtrl.text.trim(),
        startPrice: int.parse(_priceCtrl.text.trim()),
      );
      await api.startAuction(auction.id);
      final tokenData = await api.getToken(
        roomName: auction.id,
        userId: widget.user.id,
        role: widget.user.role,
      );
      if (!mounted) return;
      await Navigator.of(context).pushReplacement(MaterialPageRoute(
        builder: (_) => LiveScreen(
          auction: auction,
          user: widget.user,
          liveToken: tokenData['token'] as String,
          serverUrl: tokenData['serverUrl'] as String,
        ),
      ));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('경매 시작 실패: $e')),
      );
      setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('경매 만들기',
            style: TextStyle(fontWeight: FontWeight.w700)),
      ),
      body: SafeArea(
        child: MaxWidthBox(
          maxWidth: 520,
          padding: const EdgeInsets.all(20),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('상품 정보',
                    style: Theme.of(context).textTheme.headlineSmall),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _productCtrl,
                  enabled: !_submitting,
                  decoration: const InputDecoration(
                    labelText: '상품명',
                    hintText: '예) 햇사과 5kg',
                  ),
                  validator: (v) =>
                      (v == null || v.trim().isEmpty) ? '상품명을 입력하세요' : null,
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _priceCtrl,
                  enabled: !_submitting,
                  keyboardType: TextInputType.number,
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                  decoration: const InputDecoration(
                    labelText: '시작가',
                    hintText: '예) 10000',
                    suffixText: '원',
                  ),
                  validator: (v) {
                    if (v == null || v.trim().isEmpty) return '시작가를 입력하세요';
                    final n = int.tryParse(v.trim());
                    if (n == null || n <= 0) return '0보다 큰 숫자를 입력하세요';
                    return null;
                  },
                ),
                const SizedBox(height: 32),
                ElevatedButton(
                  onPressed: _submitting ? null : _onStart,
                  child: _submitting
                      ? const SizedBox(
                          height: 20,
                          width: 20,
                          child: CircularProgressIndicator(
                            strokeWidth: 2.5,
                            valueColor:
                                AlwaysStoppedAnimation(AppColors.primaryInk),
                          ),
                        )
                      : const Text('경매 시작'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
