import 'auction.dart';

class Live {
  final String id;
  final String sellerId;
  final String title;
  final String status; // 'live' | 'ended'
  final int viewerCount;
  final String? currentAuctionId;
  final Auction? currentAuction;
  final String createdAt;

  const Live({
    required this.id,
    required this.sellerId,
    required this.title,
    required this.status,
    required this.viewerCount,
    this.currentAuctionId,
    this.currentAuction,
    required this.createdAt,
  });

  factory Live.fromJson(Map<String, dynamic> json) {
    return Live(
      id: json['id'].toString(),
      sellerId: json['sellerId'].toString(),
      title: json['title'] as String? ?? '',
      status: json['status'] as String? ?? 'live',
      viewerCount: (json['viewerCount'] as num?)?.toInt() ?? 0,
      currentAuctionId: json['currentAuctionId']?.toString(),
      currentAuction: json['currentAuction'] != null
          ? Auction.fromJson(json['currentAuction'] as Map<String, dynamic>)
          : null,
      createdAt: json['createdAt']?.toString() ?? '',
    );
  }

  Live copyWith({
    String? id,
    String? sellerId,
    String? title,
    String? status,
    int? viewerCount,
    String? currentAuctionId,
    Auction? currentAuction,
    String? createdAt,
  }) =>
      Live(
        id: id ?? this.id,
        sellerId: sellerId ?? this.sellerId,
        title: title ?? this.title,
        status: status ?? this.status,
        viewerCount: viewerCount ?? this.viewerCount,
        currentAuctionId: currentAuctionId ?? this.currentAuctionId,
        currentAuction: currentAuction ?? this.currentAuction,
        createdAt: createdAt ?? this.createdAt,
      );
}
