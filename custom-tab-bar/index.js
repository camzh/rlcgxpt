Component({
  data: {
    selected: 0
  },

  methods: {
    switchTab(event) {
      const { index, path } = event.currentTarget.dataset;
      this.setData({ selected: Number(index) });
      wx.switchTab({ url: path });
    }
  }
});
