import { nextTick, reactive, watch, ReactiveProxy } from '..'

describe('r', () => {
  it('allows simple property access', () => {
    const data = reactive({ x: 123, y: 'abc' })
    expect(data.x).toBe(123)
    expect(data.y).toBe('abc')
  })

  it('allows setting properties', () => {
    const data = reactive({})
    expect(data.x).toBe(undefined)
    data.x = 'foo'
    expect(data.x).toBe('foo')
  })

  it('can record dependencies', async () => {
    const data = reactive({
      a: 'foo',
      b: 'boo',
      c: 'can',
      bar: {
        baz: 'caz',
      },
    })
    const x = jest.fn(() => data.a + data.c)
    watch(x)
    data.foo = 'bar' // should not trigger since it wasnt recorded.
    data.a = 'hello'
    await nextTick()
    expect(x.mock.calls.length).toBe(2)
    expect(x.mock.results[1].value).toBe('hellocan')
  })

  it('allows simple observation registration', async () => {
    const data = reactive({
      foo: 'bar',
      bar: 'foo',
    })
    const listener = jest.fn()
    data.$on('bar', listener)
    data.foo = 'hello'
    await nextTick()
    expect(listener.mock.calls.length).toBe(0)
    data.bar = 'baz'
    await nextTick()
    expect(listener.mock.calls.length).toBe(1)
    expect(listener.mock.calls[0]).toEqual(['baz', 'foo'])
  })

  it('can stop listening to changes', async () => {
    const data = reactive({
      foo: 'bar',
      bar: 'foo',
    })
    const listener = jest.fn()
    data.$on('bar', listener)
    data.bar = 'baz'
    await nextTick()
    expect(listener.mock.calls.length).toBe(1)
    data.$off('bar', listener)
    data.bar = 'fizz'
    await nextTick()
    expect(listener.mock.calls.length).toBe(1)
  })

  it('can track dependencies on shadow properties when they are lit up', async () => {
    const data = reactive({
      value: 0,
      name: 'Bob',
    })
    const hasName = () => (data.value > 0.5 ? data.name : 'nothing')
    const setValue = jest.fn()
    watch(hasName, setValue)
    expect(setValue.mock.calls.length).toBe(1)
    data.name = 'Jonny'
    await nextTick()
    expect(setValue.mock.calls.length).toBe(1)
    data.value = 1
    await nextTick()
    expect(setValue.mock.calls.length).toBe(2)
    data.name = 'Jill'
    await nextTick()
    expect(setValue.mock.calls.length).toBe(3)
  })

  it('consolidates identical watcher expressions', async () => {
    const data = reactive({
      list: ['a', 'b', 'c'],
    })
    const callback = jest.fn()
    watch(() => data.list.map((item: string) => item), callback)
    expect(callback.mock.calls.length).toBe(1)
    data.list.unshift('first')
    await nextTick()
    expect(callback.mock.calls.length).toBe(2)
  })

  it('untracks dependencies that fall back into shadow', async () => {
    const data = reactive({
      value: 0,
      name: 'Bob',
    })
    const hasName = () => (data.value > 0.5 ? data.name : 'nothing')
    const setValue = jest.fn()
    watch(hasName, setValue)
    expect(setValue.mock.calls.length).toBe(1)
    data.value = 1
    data.name = 'hello'
    await nextTick()
    expect(setValue.mock.calls.length).toBe(2)
    data.value = 0
    await nextTick()
    expect(setValue.mock.calls.length).toBe(3)
    data.name = 'molly'
    await nextTick()
    expect(setValue.mock.calls.length).toBe(3)
  })

  it('is able to track dependencies on nested tracking calls', async () => {
    const data = reactive({
      value: 0,
      name: 'Bob',
      location: 'Big City',
    })
    const hasNameCb = jest.fn()
    const printNameCb = jest.fn()

    function printName() {
      return data.name
    }
    function hasName(): void | string {
      if (data.value > 1) {
        watch(printName, printNameCb)
      }
    }
    watch(hasName, hasNameCb)
    expect(hasNameCb.mock.calls.length).toBe(1)
    expect(printNameCb.mock.calls.length).toBe(0)
    data.value = 2
    await nextTick()
    expect(printNameCb.mock.calls.length).toBe(1) // Previously shadowed
    expect(hasNameCb.mock.calls.length).toBe(2)
    data.name = 'hello'
    await nextTick()
    expect(hasNameCb.mock.calls.length).toBe(3)
  })

  it('is able to react to nested reactive object mutations', async () => {
    const data = reactive({
      first: 'Justin',
      user: { last: 'Schroeder', username: 'bob1999' },
    })
    const callback = jest.fn()
    watch(() => data.user.last, callback)
    expect(callback.mock.calls.length).toBe(1)
    data.user.last = 'Poppies'
    await nextTick()
    expect(callback.mock.calls.length).toBe(2)
    expect(callback.mock.calls[1][0]).toBe('Poppies')
  })

  it('can does not call observers from previous reactive objects that didnt change', () => {
    const data = reactive({
      list: [{ name: 'fred' }],
    })
    const callback = jest.fn()
    data.list[0].$on('name', callback)
    data.list[0] = { name: 'fred' }
    expect(callback.mock.calls.length).toBe(0)
  })

  it('can merge existing recursive object observers', () => {
    const user = reactive({ name: 'fred' })
    const data = reactive({
      users: [{ name: 'ted' }],
    })
    const listObserver = jest.fn()
    const userObserver = jest.fn()
    data.users[0].$on('name', listObserver)
    user.$on('name', userObserver)
    data.users[0] = user
    expect(listObserver.mock.calls.length).toBe(1)
    expect(userObserver.mock.calls.length).toBe(0)
  })

  it('is able to de-register nested dependencies when they move into logical shadow', async () => {
    const data = reactive({
      first: 'Bob',
      user: { last: 'Schroeder', username: 'bob1999' },
    })
    const callback = jest.fn()
    watch(
      () => (data.first === 'Justin' ? '@jpschroeder' : data.user.username),
      callback
    )
    expect(callback.mock.calls.length).toBe(1)
    data.user.username = 'poppy22'
    await nextTick()
    expect(callback.mock.calls.length).toBe(2)
    expect(callback.mock.calls[1][0]).toBe('poppy22')
    data.first = 'Justin'
    await nextTick()
    expect(callback.mock.calls.length).toBe(3)
    data.user.username = 'jenny33'
    await nextTick()
    expect(callback.mock.calls.length).toBe(3)
  })

  it('will notify the root property of array mutations', () => {
    const data = reactive({
      list: ['a', 'b'],
    })
    const callback = jest.fn()
    data.$on('list', callback)
    data.list.push('c')
    expect(callback.mock.calls.length).toBe(1)
  })

  it('will notify the root property of array mutations on newly assigned nested r', () => {
    const data = reactive({
      list: [] as string[],
    })
    const callback = jest.fn()
    data.$on('list', callback)
    data.list.push('c')
    expect(callback.mock.calls.length).toBe(1)
    data.list = reactive(['a', 'b'])
    expect(callback.mock.calls.length).toBe(2)
    data.list.push('c')
    expect(callback.mock.calls.length).toBe(3)
  })

  it('will notify root observers on objects of property mutations', () => {
    const initData = {
      food: {
        fruit: 'apple' as string,
      } as { [index: string]: string },
    }
    const data = reactive(initData)
    const callback = jest.fn()
    data.$on('food', callback)
    data.food.breakfast = 'eggs'
    expect(callback.mock.calls.length).toBe(1)
  })

  it('can automatically swap object dependency and update listeners on it’s properties', () => {
    const data = reactive({
      user: {
        name: 'Justin',
      },
    })
    const callback = jest.fn()
    data.user.$on('name', callback)
    expect(callback.mock.calls.length).toBe(0)
    data.user.name = 'Dustin'
    expect(callback.mock.calls.length).toBe(1)
    data.user = { name: 'Frank' } as ReactiveProxy<{ name: 'Frank' }>
    expect(callback.mock.calls.length).toBe(2)
  })

  it('can observe multiple data objects in watcher', async () => {
    const a = reactive({ price: 45 })
    const b = reactive({ quantity: 25 })
    const callback = jest.fn()
    watch(() => a.price * b.quantity, callback)
    expect(callback.mock.calls[0][0]).toBe(1125)
    a.price = 100
    await nextTick()
    expect(callback.mock.calls[1][0]).toBe(2500)
    b.quantity = 5
    await nextTick()
    expect(callback.mock.calls[2][0]).toBe(500)
  })
})