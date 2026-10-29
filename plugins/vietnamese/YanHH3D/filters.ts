import { type Filters, FilterTypes } from '@libs/filterInputs';

export default {
  category: {
    type: FilterTypes.Picker,
    label: 'Chuyên mục',
    value: 'moi-cap-nhat',
    options: [
      { label: 'Mới cập nhật', value: 'moi-cap-nhat' },
      { label: 'Hoạt Hình 3D', value: 'hoat-hinh-3d' },
      { label: 'Hoạt Hình 2D', value: 'hoat-hinh-2d' },
      { label: 'Hoạt Hình 4K', value: 'hoat-hinh-4k' },
      { label: 'Hoạt Hình AI', value: 'hoat-hinh-ai' },
      { label: 'Đang chiếu', value: 'dang-chieu' },
      { label: 'Đã hoàn thành', value: 'hoan-thanh' },
      { label: 'Phim lẻ | Ova', value: 'phim-le' },
    ],
  },
  genre: {
    type: FilterTypes.Picker,
    label: 'Thể loại',
    value: '',
    options: [
      { label: 'Tất cả', value: '' },
      { label: 'Huyền Huyễn', value: 'huyen-huyen' },
      { label: 'Xuyên Không', value: 'xuyen-khong' },
      { label: 'Trùng Sinh', value: 'trung-sinh' },
      { label: 'Tiên Hiệp', value: 'tien-hiep' },
      { label: 'Cổ Trang', value: 'co-trang' },
      { label: 'Hài Hước', value: 'hai-huoc' },
      { label: 'Kiếm Hiệp', value: 'kiem-hiep' },
      { label: 'Hiện Đại', value: 'hien-dai' },
    ],
  },
} satisfies Filters;
