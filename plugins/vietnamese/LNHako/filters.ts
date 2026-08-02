import { FilterTypes, Filters } from '@libs/filterInputs';

export default {
  title: {
    type: FilterTypes.TextInput,
    label: 'Tên truyện',
    value: '',
  },
  author: {
    type: FilterTypes.TextInput,
    label: 'Tác giả',
    value: '',
  },
  illustrator: {
    type: FilterTypes.TextInput,
    label: 'Họa sĩ',
    value: '',
  },
  status: {
    type: FilterTypes.Picker,
    label: 'Tình trạng',
    value: '0',
    options: [
      { label: 'Tất cả', value: '0' },
      { label: 'Đang tiến hành', value: '1' },
      { label: 'Tạm ngưng', value: '2' },
      { label: 'Đã hoàn thành', value: '3' },
    ],
  },
  sapxep: {
    type: FilterTypes.Picker,
    label: 'Sắp xếp',
    value: '',
    options: [
      { label: 'A-Z', value: '' },
      { label: 'Z-A', value: 'tentruyenza' },
      { label: 'Mới cập nhật', value: 'capnhat' },
      { label: 'Mới đăng', value: 'truyenmoi' },
      { label: 'Lượt xem', value: 'top' },
      { label: 'Top tháng', value: 'topthang' },
      { label: 'Theo dõi', value: 'theodoi' },
      { label: 'Số từ', value: 'sotu' },
    ],
  },
  seriestype: {
    type: FilterTypes.Picker,
    label: 'Loại truyện',
    value: '0',
    options: [
      { label: 'Tất cả', value: '0' },
      { label: 'Truyện dịch', value: '1' },
      { label: 'AI dịch', value: '2' },
      { label: 'Sáng tác', value: '3' },
    ],
  },
  genres: {
    type: FilterTypes.ExcludableCheckboxGroup,
    label: 'Thể loại',
    value: {
      include: [],
      exclude: [],
    },
    options: [
      {
        label: 'Action',
        value: '1',
      },
      {
        label: 'Adapted to Anime',
        value: '49',
      },
      {
        label: 'Adapted to Drama CD',
        value: '51',
      },
      {
        label: 'Adapted to Manga',
        value: '50',
      },
      {
        label: 'Adapted to Manhua',
        value: '64',
      },
      {
        label: 'Adapted to Manhwa',
        value: '65',
      },
      {
        label: 'Adventure',
        value: '2',
      },
      {
        label: 'Age Gap',
        value: '52',
      },
      {
        label: 'Boys Love',
        value: '60',
      },
      {
        label: 'Character Growth',
        value: '54',
      },
      {
        label: 'Chinese Novel',
        value: '39',
      },
      {
        label: 'Comedy',
        value: '3',
      },
      {
        label: 'Cooking',
        value: '43',
      },
      {
        label: 'Different Social Status',
        value: '56',
      },
      {
        label: 'Drama',
        value: '4',
      },
      {
        label: 'Ecchi',
        value: '5',
      },
      {
        label: 'English Novel',
        value: '40',
      },
      {
        label: 'Fanfiction',
        value: '62',
      },
      {
        label: 'Fantasy',
        value: '6',
      },
      {
        label: 'Female Protagonist',
        value: '59',
      },
      {
        label: 'Game',
        value: '45',
      },
      {
        label: 'Gender Bender',
        value: '7',
      },
      {
        label: 'Harem',
        value: '8',
      },
      {
        label: 'Historical',
        value: '35',
      },
      {
        label: 'Horror',
        value: '9',
      },
      {
        label: 'Isekai',
        value: '30',
      },
      {
        label: 'Josei',
        value: '33',
      },
      {
        label: 'Korean Novel',
        value: '34',
      },
      {
        label: 'Magic',
        value: '44',
      },
      {
        label: 'Martial Arts',
        value: '37',
      },
      {
        label: 'Mecha',
        value: '11',
      },
      {
        label: 'Military',
        value: '36',
      },
      {
        label: 'Misunderstanding',
        value: '58',
      },
      {
        label: 'Mystery',
        value: '12',
      },
      {
        label: 'Netorare',
        value: '32',
      },
      {
        label: 'Obsession',
        value: '69',
      },
      {
        label: 'One shot',
        value: '38',
      },
      {
        label: 'Otome Game',
        value: '46',
      },
      {
        label: 'Parody',
        value: '61',
      },
      {
        label: 'Psychological',
        value: '23',
      },
      {
        label: 'Reverse Harem',
        value: '47',
      },
      {
        label: 'Romance',
        value: '22',
      },
      {
        label: 'Satire',
        value: '66',
      },
      {
        label: 'School Life',
        value: '13',
      },
      {
        label: 'Science Fiction',
        value: '14',
      },
      {
        label: 'Seinen',
        value: '31',
      },
      {
        label: 'Shoujo',
        value: '15',
      },
      {
        label: 'Shoujo ai',
        value: '16',
      },
      {
        label: 'Shounen',
        value: '26',
      },
      {
        label: 'Shounen ai',
        value: '17',
      },
      {
        label: 'Slice of Life',
        value: '18',
      },
      {
        label: 'Slow Life',
        value: '55',
      },
      {
        label: 'Sports',
        value: '19',
      },
      {
        label: 'Super Power',
        value: '24',
      },
      {
        label: 'Supernatural',
        value: '20',
      },
      {
        label: 'Suspense',
        value: '25',
      },
      {
        label: 'Tragedy',
        value: '21',
      },
      {
        label: 'Wars',
        value: '53',
      },
      {
        label: 'Web Novel',
        value: '29',
      },
      {
        label: 'Workplace',
        value: '57',
      },
      {
        label: 'Wuxia',
        value: '67',
      },
      {
        label: 'Xianxia',
        value: '68',
      },
      {
        label: 'Yandere',
        value: '63',
      },
      {
        label: 'Yuri',
        value: '48',
      },
    ],
  },
} satisfies Filters;
